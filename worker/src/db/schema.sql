PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority    TEXT    NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee    TEXT    NOT NULL DEFAULT 'unassigned',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_priority       ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee       ON tasks (assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_title          ON tasks (title);

CREATE TABLE IF NOT EXISTS audit_runs (
  id          TEXT PRIMARY KEY,
  score       INTEGER NOT NULL,
  findings    INTEGER NOT NULL,
  report      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_created ON audit_runs (created_at DESC);