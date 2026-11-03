import type { MiddlewareHandler } from "hono";
import { AppError, RateLimitError } from "../lib/errors";
import { log } from "../lib/logger";
import { increment, observe } from "../lib/metrics";
import { flushMetrics } from "../lib/metricsStore";
import { RateLimiter, classifyRequest } from "../lib/rateLimiter";
import type { Env } from "../types";

/**
 * CORS с явным allowlist'ом происхождений.
 *
 * `origin: "*"` недопустим, когда API хранит состояние (JWT-сессии,
 * записи в БД): любой сайт мог бы читать ответы авторизованных запросов
 * из браузера жертвы. Поэтому только origin'ы из FRONTEND_ORIGIN.
 *
 * Реализовано вручную, а не через hono/cors: так видна полная механика
 * preflight, Vary: Origin и обработка сервер-к-серверу (без Origin).
 */
export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const allowed = (c.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = c.req.header("origin");
  const isAllowed = origin !== undefined && allowed.includes(origin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    "Access-Control-Expose-Headers": "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  if (c.req.method === "OPTIONS") {
    // Preflight: Hono не применяет c.header() к Response, возвращённому
    // напрямую из обработчика — поэтому заголовки ставим в конструктор.
    headers["Access-Control-Max-Age"] = "600";
    return new Response(null, { status: 204, headers });
  }

  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }
  await next();
};

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

/**
 * Token-bucket rate limiter с классами маршрутов (auth/write/read).
 *
 * Заголовки X-RateLimit-* позволяют клиенту видеть остаток квоты,
 * а 429 отвечает с Retry-After. Лимитер fail-open при деградации KV —
 * доступность API важнее строгости лимита (см. ADR-013).
 */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const cls = classifyRequest(c.req.method, c.req.path);
  const limiter = new RateLimiter(c.env.CACHE);
  const result = await limiter.check(ip, cls);

  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Class", cls);
  if (result.retryAfterSec > 0) {
    c.header("Retry-After", String(result.retryAfterSec));
  }

  if (!result.allowed) {
    increment("rate_limit_rejections_total", { route: c.req.path ?? "/", class: cls });
    log("warn", "rate_limit_exceeded", { ip, class: cls, route: c.req.path });
    throw new RateLimitError(result.retryAfterSec);
  }

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
