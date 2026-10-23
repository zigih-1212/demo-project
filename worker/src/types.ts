export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  QUEUE: Queue<TaskJob>;
  ENVIRONMENT: string;
  LOG_LEVEL: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskJob {
  type: "task.export" | "task.reindex" | "audit.run";
  taskId?: string;
  requestedAt: string;
}

export interface AuditFinding {
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  location: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ListTasksQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  sort: "created_at" | "priority" | "title";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}