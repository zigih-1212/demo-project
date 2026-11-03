import { Hono } from "hono";
import { AnalyticsService } from "../services/analyticsService";
import { AuditService } from "../services/auditService";
import { CacheService } from "../lib/cache";
import { TaskRepository } from "../repositories/taskRepository";
import { increment } from "../lib/metrics";
import { log } from "../lib/logger";
import type { Env } from "../types";

export function analyticsRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/summary", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "14", 10);
    const service = new AnalyticsService(
      new TaskRepository(c.env.DB),
      new CacheService(c.env.CACHE),
    );
    return c.json(await service.summary(Number.isNaN(days) ? 14 : days));
  });

  routes.get("/audit", async (c) => {
    increment("ai_audit_runs_total", { trigger: "manual" });
    const report = await new AuditService(c.env.DB).run();
    return c.json(report);
  });

  routes.post("/audit", async (c) => {
    increment("ai_audit_runs_total", { trigger: "scheduled" });
    const report = await new AuditService(c.env.DB).run();
    // Постановка в очередь — best-effort: отчёт уже сформирован и возвращён
    // вызывающему; consumer персистит его в audit_runs. Сбой доставки
    // фиксируется метрикой, но не откатывает успешный ответ (ADR-015).
    try {
      await c.env.QUEUE.send({ type: "audit.run", requestedAt: new Date().toISOString() });
    } catch (error) {
      increment("queue_send_errors_total", { job: "audit.run" });
      log("error", "queue_send_failed", {
        job: "audit.run",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return c.json(report);
  });

  return routes;
}