import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler, httpLogger, metricsFlush, rateLimit, requestId } from "./middleware";
import { renderPrometheus, setGauge } from "./lib/metrics";
import { readPersistedMetrics } from "./lib/metricsStore";
import { configureLogger, log } from "./lib/logger";
import { optionalAuth, requireAuth } from "./middleware/auth";
import { taskRoutes } from "./routes/tasks";
import { authRoutes } from "./routes/auth";
import { activityRoutes } from "./routes/activity";
import { analyticsRoutes } from "./routes/analytics";
import type { Env, TaskJob } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-Request-Id"], allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
app.use("/api/*", rateLimit);
app.use("*", httpLogger);
app.use("*", metricsFlush);
app.use("*", optionalAuth);
app.onError(errorHandler);

app.get("/", (c) =>
  c.json({
    service: "demo-fullstack-backend",
    version: "1.0.0",
    runtime: "Cloudflare Workers",
    docs: "/api/v1/tasks",
  }),
);

app.get("/health", async (c) => {
  const started = Date.now();
  await c.env.DB.prepare("SELECT 1").first();
  setGauge("db_latency_ms", Date.now() - started);
  return c.json({ status: "ok", db: "ok", env: c.env.ENVIRONMENT, ts: new Date().toISOString() });
});

app.get("/metrics", async (c) => {
  const rows = await readPersistedMetrics(c.env.DB);
  const persisted = rows.map((row) => {
    let labels: Record<string, string> = {};
    try {
      labels = JSON.parse(row.labels) as Record<string, string>;
    } catch {
      labels = {};
    }
    return { name: row.name, labels, value: row.value };
  });
  return c.text(renderPrometheus(persisted), 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
});

app.route("/api/v1/auth", authRoutes());

app.route("/api/v1/activity", activityRoutes());

app.route("/api/v1/tasks", taskRoutes());
app.route("/api/v1/analytics", analyticsRoutes());

app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    configureLogger(env.LOG_LEVEL);
    return app.fetch(request, env, ctx);
  },


  async queue(batch: MessageBatch<TaskJob>, env: Env): Promise<void> {
    configureLogger(env.LOG_LEVEL);
    for (const message of batch.messages) {
      try {
        const job = JSON.parse(message.body as unknown as string) as { type: string; taskId?: string };
        log("info", "job_processed", { type: job.type, taskId: job.taskId });

        if (job.type === "audit.run") {
          const { AuditService } = await import("./services/auditService");
          const report = await new AuditService(env.DB).run();
          log("info", "audit_completed", { score: report.score, findings: report.findings.length });
        }
        message.ack();
      } catch (error) {
        log("error", "job_failed", { message: error instanceof Error ? error.message : String(error) });
        message.retry();
      }
    }
  },
};