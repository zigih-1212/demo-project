import type { MiddlewareHandler } from "hono";
import { AppError, RateLimitError } from "../lib/errors";
import { log } from "../lib/logger";
import { increment, observe } from "../lib/metrics";
import { flushMetrics } from "../lib/metricsStore";

export const requestId: MiddlewareHandler = async (c, next) => {
  const id = (c.req.header("x-request-id") as string) ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};

export const httpLogger: MiddlewareHandler = async (c, next) => {
  const started = Date.now();
  await next();
  const durationMs = Date.now() - started;
  const requestId = (c.get("requestId") as string) ?? "unknown";
  const route = c.req.path ?? "/";

  increment("http_requests_total", { method: c.req.method, route, status: String(c.res.status) });
  observe("http_request_duration_seconds", durationMs / 1000, { method: c.req.method, route });

  log(c.res.status >= 500 ? "error" : c.res.status >= 400 ? "warn" : "info", "request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  });
};

export const errorHandler = (err: Error, c: { get: (k: string) => unknown; json: (body: unknown, status?: number) => Response }) => {
  const requestId = (c.get("requestId") as string) ?? "unknown";
  if (err instanceof AppError) {
    log("warn", err.code, { requestId, message: err.message, details: err.details });
    increment("http_errors_total", { code: err.code, route: c.get ? (c.get("route") as string) ?? "/" : "/" });
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details }, requestId },
      err.status as 400,
    );
  }

  log("error", "unhandled_error", {
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  increment("http_errors_total", { code: "internal_error" });
  return c.json(
    { error: { code: "internal_error", message: "Internal server error" }, requestId },
    500,
  );
};

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 120;

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const key = "rl:" + ip;
  const raw = await c.env.CACHE.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;

  if (count >= MAX_REQUESTS) {
    increment("rate_limit_rejections_total", { route: c.req.path ?? "/" });
    c.header("Retry-After", String(WINDOW_SECONDS));
    throw new RateLimitError(WINDOW_SECONDS);
  }

  await c.env.CACHE.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  await next();
};

/**
 * Сбрасывает счётчики в D1 после ответа из того же изолята, что и запрос.
 *
 * Крон-триггер здесь не годится: он выполняется в отдельном изоляте и не
 * видит счётчики, накопленные при обработке запроса. waitUntil не блокирует
 * клиента, а запись троттлится внутри flushMetrics.
 */
export const metricsFlush: MiddlewareHandler = async (c, next) => {
  await next();
  const ctx = c.executionCtx as ExecutionContext | undefined;
  if (ctx) {
    ctx.waitUntil(flushMetrics(c.env.DB));
  }
};
