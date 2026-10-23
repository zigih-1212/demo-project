import { drainCounters, restoreCounters } from "../lib/metrics";
import { log } from "../lib/logger";

/**
 * Персистентность метрик.
 *
 * Изоляты Cloudflare Workers короткоживущие: счётчики, накопленные при
 * обработке запросов, исчезают вместе с изолятом. Поэтому дельты сливаются
 * в D1 из того же изолята, который обработал запрос (через waitUntil),
 * а не из cron-триггера — cron исполняется в отдельном изоляте и не видит
 * эти счётчики.
 *
 * Запись идёт отдельными батчами: один INSERT ... ON CONFLICT на каждый
 * счётчик, атомарно на уровне D1.
 */

interface CounterRow {
  id: string;
  kind: string;
  name: string;
  labels: string;
  value: number;
}

let lastFlushAt = 0;
let flushInFlight = false;

const FLUSH_INTERVAL_MS = 1000;

function metricId(kind: string, name: string, labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  const suffix = keys.length ? keys.map((k) => k + "=" + labels[k]).join(",") : "";
  return kind + "|" + name + (suffix ? "|" + suffix : "");
}

export async function flushMetrics(db: D1Database, force = false): Promise<number> {
  if (flushInFlight) return 0;

  const now = Date.now();
  if (!force && now - lastFlushAt < FLUSH_INTERVAL_MS) return 0;

  const snapshot = drainCounters();
  if (snapshot.length === 0) return 0;

  flushInFlight = true;
  try {
    const statements = snapshot.map((entry) =>
      db
        .prepare(
          "INSERT INTO metrics_counters (id, kind, name, labels, value, updated_at) " +
            "VALUES (?, 'counter', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) " +
            "ON CONFLICT(id) DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at",
        )
        .bind(metricId("counter", entry.name, entry.labels), entry.name, JSON.stringify(entry.labels), entry.value),
    );
    await db.batch(statements);
    lastFlushAt = now;
    return snapshot.length;
  } catch (error) {
    restoreCounters(snapshot);
    log("error", "metrics_flush_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  } finally {
    flushInFlight = false;
  }
}

export async function readPersistedMetrics(db: D1Database): Promise<CounterRow[]> {
  const result = await db
    .prepare("SELECT id, kind, name, labels, value FROM metrics_counters")
    .all<CounterRow>();
  return result.results ?? [];
}