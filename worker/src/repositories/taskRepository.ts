import type { ListTasksQuery, Paginated, Task, TaskPriority, TaskStatus } from "../types";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  created_by: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, title, description, status, priority, assignee, created_by, due_date, created_at, updated_at";

const PRIORITY_RANK: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    assignee: row.assignee || "unassigned",
    createdBy: row.created_by,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFilters(query: ListTasksQuery): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.status) {
    clauses.push("status = ?");
    params.push(query.status);
  }
  if (query.priority) {
    clauses.push("priority = ?");
    params.push(query.priority);
  }
  if (query.assignee) {
    clauses.push("assignee = ?");
    params.push(query.assignee);
  }
  if (query.search) {
    clauses.push("(title LIKE ? OR description LIKE ?)");
    const needle = "%" + query.search.replace(/[%_]/g, "\\$&") + "%";
    params.push(needle, needle);
  }

  return { where: clauses.length ? " WHERE " + clauses.join(" AND ") : "", params };
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
  dueDate: string | null;
  createdBy: string;
}

export type UpdateTaskInput = Partial<CreateTaskInput> & { status?: TaskStatus };

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

  async list(query: ListTasksQuery): Promise<Paginated<Task>> {
    const { where, params } = buildFilters(query);

    const totalRow = await this.db
      .prepare("SELECT COUNT(*) AS total FROM tasks" + where)
      .bind(...params)
      .first<{ total: number }>();

    const orderClause =
      query.sort === "priority"
        ? "ORDER BY CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END " +
          query.order.toUpperCase()
        : "ORDER BY " + query.sort + " " + query.order.toUpperCase();

    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db
      .prepare(
        "SELECT " + COLUMNS + " FROM tasks" + where + " " + orderClause + " LIMIT ? OFFSET ?",
      )
      .bind(...params, query.pageSize, offset)
      .all<TaskRow>();

    const total = totalRow?.total ?? 0;
    return {
      items: (rows.results ?? []).map(toTask),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<Task | null> {
    const row = await this.db
      .prepare("SELECT " + COLUMNS + " FROM tasks WHERE id = ?")
      .bind(id)
      .first<TaskRow>();
    return row ? toTask(row) : null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db
      .prepare(
        "INSERT INTO tasks (id, title, description, status, priority, assignee, created_by, due_date, created_at, updated_at) " +
          "VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        input.title,
        input.description,
        input.priority,
        input.assignee,
        input.createdBy,
        input.dueDate,
        now,
        now,
      )
      .run();
    return (await this.findById(id)) as Task;
  }

  async update(id: string, patch: UpdateTaskInput): Promise<Task | null> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (patch.title !== undefined) {
      fields.push("title = ?");
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      fields.push("description = ?");
      params.push(patch.description);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      params.push(patch.status);
    }
    if (patch.priority !== undefined) {
      fields.push("priority = ?");
      params.push(patch.priority);
    }
    if (patch.assignee !== undefined) {
      fields.push("assignee = ?");
      params.push(patch.assignee);
    }
    if (patch.dueDate !== undefined) {
      fields.push("due_date = ?");
      params.push(patch.dueDate);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = ?");
    params.push(new Date().toISOString(), id);

    await this.db
      .prepare("UPDATE tasks SET " + fields.join(", ") + " WHERE id = ?")
      .bind(...params)
      .run();

    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async statsByStatus(): Promise<Record<TaskStatus, number>> {
    const rows = await this.db
      .prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status")
      .all<{ status: TaskStatus; count: number }>();

    const base: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    for (const row of rows.results ?? []) base[row.status] = row.count;
    return base;
  }

  async statsByPriority(): Promise<Record<TaskPriority, number>> {
    const rows = await this.db
      .prepare("SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority")
      .all<{ priority: TaskPriority; count: number }>();

    const base: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of rows.results ?? []) base[row.priority] = row.count;
    return base;
  }

  async countAll(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS total FROM tasks").first<{ total: number }>();
    return row?.total ?? 0;
  }

  async countOverdue(): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS total FROM tasks WHERE due_date IS NOT NULL AND due_date < ? AND status != 'done'",
      )
      .bind(new Date().toISOString())
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  async createdPerDay(days: number): Promise<Array<{ date: string; count: number }>> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await this.db
      .prepare(
        "SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM tasks WHERE created_at >= ? GROUP BY date ORDER BY date ASC",
      )
      .bind(since)
      .all<{ date: string; count: number }>();
    return rows.results ?? [];
  }

  async completedPerDay(days: number): Promise<Array<{ date: string; count: number }>> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await this.db
      .prepare(
        "SELECT substr(updated_at, 1, 10) AS date, COUNT(*) AS count FROM tasks WHERE status = 'done' AND updated_at >= ? GROUP BY date ORDER BY date ASC",
      )
      .bind(since)
      .all<{ date: string; count: number }>();
    return rows.results ?? [];
  }

  async topAssignees(limit: number): Promise<Array<{ assignee: string; count: number; done: number }>> {
    const rows = await this.db
      .prepare(
        "SELECT assignee, COUNT(*) AS count, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done " +
          "FROM tasks GROUP BY assignee ORDER BY count DESC LIMIT ?",
      )
      .bind(limit)
      .all<{ assignee: string; count: number; done: number }>();
    return rows.results ?? [];
  }
}

export { PRIORITY_RANK };
