import { log } from "../lib/logger";
import { AuditService } from "../services/auditService";
import { CacheService } from "../lib/cache";
import type { Env, TaskJob } from "../types";

/**
 * Обработчик очереди (Cloudflare Queues consumer).
 *
 * Вынесен из index.ts в отдельный модуль, чтобы его можно было тестировать
 * напрямую: consumer — это часть бизнес-логики (персистентность отчётов
 * аудита, инвалидация кэша после reindex), а не plumbing.
 *
 * Идемпотентность: обработка сообщения может повториться после retry.
 * audit.run — INSERT (дубликаты отчётов допустимы, они исторические);
 * task.reindex — инвалидация кэша (операция идемпотентна по природе).
 */
export async function processBatch(batch: MessageBatch<TaskJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      // Тело приходит как объект (typed binding) или строка (raw/JSON).
      const job: TaskJob =
        typeof message.body === "string"
          ? (JSON.parse(message.body) as TaskJob)
          : (message.body as TaskJob);

      if (job.type === "audit.run") {
        const report = await new AuditService(env.DB).run();
        // Персистим отчёт: scheduled-аудиты должны оставлять историю.
        await env.DB
          .prepare("INSERT INTO audit_runs (id, score, findings, report) VALUES (?, ?, ?, ?)")
          .bind(crypto.randomUUID(), report.score, report.findings.length, JSON.stringify(report))
          .run();
        log("info", "audit_completed", { score: report.score, findings: report.findings.length });
      } else if (job.type === "task.reindex") {
        // Reindex: сбрасываем кэш агрегатов и списков, чтобы следующий
        // запрос пересчитал аналитику из актуальных данных D1.
        const cache = new CacheService(env.CACHE);
        await cache.invalidateNamespace("tasks:stats");
        await cache.invalidateNamespace("tasks:list");
        log("info", "reindex_completed", { taskId: job.taskId });
      }
      message.ack();
    } catch (error) {
      log("error", "job_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      message.retry();
    }
  }
}
