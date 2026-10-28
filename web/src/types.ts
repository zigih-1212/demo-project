export const API_BASE = "https://demo-fullstack-backend.dvybornyh332.workers.dev";

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type UserRole = "admin" | "member";

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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
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
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface DashboardSummary {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdueCount: number;
  completionRate: number;
  createdPerDay: Array<{ date: string; count: number }>;
  completedPerDay: Array<{ date: string; count: number }>;
  topAssignees: Array<{ assignee: string; count: number; done: number }>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface SummaryItem {
  date: string;
  count: number;
}
