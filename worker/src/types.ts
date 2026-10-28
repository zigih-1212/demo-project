export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type UserRole = "admin" | "member";

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  QUEUE: Queue<TaskJob>;
  ENVIRONMENT: string;
  LOG_LEVEL: string;
  JWT_SECRET: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  createdBy: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  taskId: string | null;
  actorId: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
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
  assignee?: string;
  search?: string;
  sort: "created_at" | "priority" | "title";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team: string;
}

export interface TokenPayload extends AuthUser {
  sub: string;
  iat: number;
  exp: number;
}
