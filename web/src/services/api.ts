import { API_BASE } from "../env";
import type {
  ActivityEntry,
  DashboardSummary,
  ListTasksQuery,
  LoginRequest,
  LoginResponse,
  Paginated,
  RegisterRequest,
  SyncVersionInfo,
  Task,
  User,
} from "../types";

/**
 * Единая точка работы с API воркера.
 *
 * Инварианты:
 * - все пути резолвятся относительно API_BASE; относительные пути запрещены
 *   (баг 405: Pages — статика, не знает /api)
 * - 401 на не-аутентификационных маршрутах = истёкшая сессия: чистим storage
 *   и перезагружаем страницу (SPA без роутинга; отдельного /login маршрута нет)
 * - ошибки сервера пробрасываются как HttpError со статусом и кодом
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("pulse_token") : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseError(res: Response): Promise<{ code: string; message: string; requestId?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string }; requestId?: string };
    if (body?.error?.message) {
      return { code: body.error.code ?? "http_error", message: body.error.message, requestId: body.requestId };
    }
  } catch {
    /* ответ не JSON — ниже статусный текст */
  }
  return { code: "http_error", message: res.statusText || `HTTP ${res.status}` };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** login/register обрабатывают 401 самостоятельно (сообщение формы), сессию не трогаем */
  skipSessionHandling?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = authHeaders();
  const init: RequestInit = { method: opts.method ?? "GET", headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const url = path.startsWith("http") ? path : API_BASE + path;
  const res = await fetch(url, init);

  if (res.status === 401 && !opts.skipSessionHandling) {
    localStorage.removeItem("pulse_token");
    localStorage.removeItem("pulse_user");
    window.location.reload();
    throw new HttpError(401, "unauthorized", "Сессия истекла");
  }
  if (!res.ok) {
    const e = await parseError(res);
    throw new HttpError(res.status, e.code, e.message, e.requestId);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

function withQuery(path: string, query?: object): string {
  if (!query) return path;
  const url = new URL(API_BASE + path);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

export interface ListTasksResult {
  items: Task[];
  total: number;
  etag: string | null;
}

/**
 * Условный GET списка задач (If-None-Match).
 * Возвращает null при 304 Not Modified — локальная копия актуальна,
 * трафик и рендер не тратятся. ETag воркера слабый (W/"версия-хэш").
 */
export async function listTasksConditional(
  query: ListTasksQuery,
  etag: string | null,
): Promise<ListTasksResult | null> {
  const headers = authHeaders();
  if (etag) headers["If-None-Match"] = etag;
  const res = await fetch(withQuery("/api/v1/tasks", query), { headers });
  if (res.status === 304) return null;
  if (!res.ok) {
    const e = await parseError(res);
    throw new HttpError(res.status, e.code, e.message, e.requestId);
  }
  const data = (await res.json()) as Paginated<Task>;
  return { items: data.items, total: data.total, etag: res.headers.get("ETag") };
}

export const api = {
  health: () => request<{ status: string; db: string; cache: string }>("/health"),

  login: (data: LoginRequest) =>
    request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: data,
      skipSessionHandling: true,
    }),

  register: (data: RegisterRequest) =>
    request<LoginResponse>("/api/v1/auth/register", {
      method: "POST",
      body: data,
      skipSessionHandling: true,
    }),

  me: () => request<{ user: User }>("/api/v1/auth/me"),
  users: () => request<{ items: User[] }>("/api/v1/auth/users"),

  listTasks: (query?: ListTasksQuery) => request<Paginated<Task>>(withQuery("/api/v1/tasks", query)),
  getTask: (id: string) => request<Task>(`/api/v1/tasks/${id}`),
  createTask: (body: {
    title: string;
    description?: string;
    priority?: string;
    assignee?: string;
    dueDate?: string | null;
  }) => request<Task>("/api/v1/tasks", { method: "POST", body }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<Task>(`/api/v1/tasks/${id}`, { method: "PATCH", body }),
  deleteTask: (id: string) => request<{ ok: boolean }>(`/api/v1/tasks/${id}`, { method: "DELETE" }),

  syncVersion: () => request<SyncVersionInfo>("/api/v1/sync/version"),
  summary: () => request<DashboardSummary>("/api/v1/analytics/summary"),
  activity: () => request<{ items: ActivityEntry[] }>("/api/v1/activity"),
};
