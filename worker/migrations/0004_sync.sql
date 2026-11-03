-- Авторитетный счётчик версий для кросс-изолятной синхронизации клиента.
-- Зачем: Workers изолированы — SSE-стрим и ETag читают эту таблицу.
-- Мутации задач инкрементируют tasks_version.
-- SSE-стрим и условный GET опрашивают версию из D1 (строгая консистентность).

CREATE TABLE IF NOT EXISTS sync_state (
  key        TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO sync_state (key, value) VALUES ('tasks_version', 1);

CREATE INDEX IF NOT EXISTS idx_sync_state_key ON sync_state (key);
