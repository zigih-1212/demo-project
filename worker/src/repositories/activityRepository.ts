import type { ActivityEntry } from "../types";

interface ActivityRow {
  id: string;
  task_id: string | null;
  actor_id: string;
  actor_name: string | null;
  action: string;
  summary: string;
  created_at: string;
}

export class ActivityRepository {
  constructor(private readonly db: D1Database) {}

  async record(entry: {
    taskId: string | null;
    actorId: string;
    action: string;
    summary: string;
  }): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO activity (id, task_id, actor_id, action, summary) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), entry.taskId, entry.actorId, entry.action, entry.summary)
      .run();
  }

  async recent(limit = 12): Promise<ActivityEntry[]> {
    const rows = await this.db
      .prepare(
        "SELECT a.id, a.task_id, a.actor_id, u.name AS actor_name, a.action, a.summary, a.created_at " +
          "FROM activity a LEFT JOIN users u ON u.id = a.actor_id " +
          "ORDER BY a.created_at DESC LIMIT ?",
      )
      .bind(limit)
      .all<ActivityRow>();

    return (rows.results ?? []).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      actorId: row.actor_id,
      actorName: row.actor_name ?? "Система",
      action: row.action,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  }
}
