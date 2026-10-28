import type {
  Task,
  ListTasksQuery,
  Paginated,
  LoginRequest,
  LoginResponse,
  User,
  ActivityEntry,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://demo-fullstack-backend.dvybornyh332.workers.dev";

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path.startsWith("http") ? path : API_BASE + path);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("pulse_token") : null;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = "Bearer " + token;
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(input as string, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body && body.error && body.error.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      localStorage.removeItem("pulse_token");
      localStorage.removeItem("pulse_user");
      window.location.href = "/login";
    }
    throw new Error(message);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  if (ct.includes("text/plain")) return res.text() as unknown as T;
  return res.text() as unknown as T;
}

export const api = {
  health: () => request<{ status: string; db: string }>("/health"),

  login: (data: LoginRequest) =>
    request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: () => request<{ user: User }>("/api/v1/auth/me"),
  users: () => request<{ items: User[] }>("/api/v1/auth/users"),

  listTasks: (query?: ListTasksQuery) =>
    request<Paginated<Task>>(buildUrl("/api/v1/tasks", query)),

  getTask: (id: string) => request<Task>(`/api/v1/tasks/${id}`),

  createTask: (body: {
    title: string;
    description?: string;
    priority?: string;
    assignee?: string;
    dueDate?: string | null;
  }) =>
    request<Task>("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTask: (id: string, body: Record<string, unknown>) =>
    request<Task>(`/api/v1/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/tasks/${id}`, { method: "DELETE" }),

  summary: () =>
    request<DashboardSummary>("/api/v1/analytics/summary"),

  activity: () => request<{ items: ActivityEntry[] }>("/api/v1/activity"),
};
