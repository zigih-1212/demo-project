-- Auth, ownership and activity feed

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  team          TEXT NOT NULL DEFAULT 'platform',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

ALTER TABLE tasks ADD COLUMN created_by TEXT;
ALTER TABLE tasks ADD COLUMN due_date   TEXT;

UPDATE tasks SET created_by = 'u-admin' WHERE created_by IS NULL;

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  task_id    TEXT,
  actor_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity (created_at DESC);

INSERT OR IGNORE INTO users (id, email, name, password_hash, role, team, created_at) VALUES
('u-admin','admin@pulse.dev','Дмитрий Выборных','pbkdf2$100000$RElnGlK4SNwGIwRjDZ0GWQ$EIBbUvwgFjMX1KwQYZrynyUv5iSKqzhq7vSw3ESZo00','admin','owner','2026-09-01T09:00:00.000Z'),
('u-anna','anna@pulse.dev','Анна Ковалёва','pbkdf2$100000$CuKZlpioTKqVFGfAq-rvMA$sX4dIk63ros-QxsnTPw67pra1ag_3-1pVEY_U5f22DA','member','frontend','2026-09-01T09:00:00.000Z'),
('u-dmitry','dmitry@pulse.dev','Дмитрий Соколов','pbkdf2$100000$lZhrd9kkZVJBSY_Qv1HzkQ$jSLGSJ-TbJ-3DSlVxCqm5GcKCkYXRD-ZWaojQbiFeJE','member','backend','2026-09-01T09:00:00.000Z');

INSERT OR IGNORE INTO activity (id, task_id, actor_id, action, summary, created_at) VALUES
('a-1','t-016','u-dmitry','status','Взял в работу «Фоновые задачи через Cloudflare Queues»','2026-10-26T09:12:00.000Z'),
('a-2','t-010','u-anna','comment','Отметила блокер по интеграции с внешним API','2026-10-26T11:40:00.000Z'),
('a-3','t-021','u-admin','create','Создал задачу «Бэкап и восстановление D1»','2026-10-25T16:05:00.000Z'),
('a-4','t-018','u-anna','status','Перевела «Покрытие тестами сервисного слоя» в работу','2026-10-25T10:22:00.000Z'),
('a-5','t-003','u-admin','status','Закрыл «Подключить Prometheus к API»','2026-10-24T18:31:00.000Z');
