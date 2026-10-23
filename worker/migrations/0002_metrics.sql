CREATE TABLE IF NOT EXISTS metrics_counters (
  id          TEXT PRIMARY KEY,
  kind        TEXT    NOT NULL CHECK (kind IN ('counter', 'gauge', 'histogram_sum', 'histogram_count')),
  name        TEXT    NOT NULL,
  labels      TEXT    NOT NULL DEFAULT '{}',
  value       REAL    NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_counters_name ON metrics_counters (name);