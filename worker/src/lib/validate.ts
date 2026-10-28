import { ValidationError } from "./errors";
import type { ListTasksQuery, TaskPriority, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];
const SORTS = ["created_at", "priority", "title"] as const;
const ORDERS = ["asc", "desc"] as const;

export function parseListQuery(params: URLSearchParams): ListTasksQuery {
  const status = params.get("status") ?? undefined;
  const priority = params.get("priority") ?? undefined;
  const assignee = params.get("assignee")?.trim() || undefined;
  const sort = params.get("sort") ?? "created_at";
  const order = params.get("order") ?? "desc";

  if (status && !STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError("Недопустимый статус", { allowed: STATUSES });
  }
  if (priority && !PRIORITIES.includes(priority as TaskPriority)) {
    throw new ValidationError("Недопустимый приоритет", { allowed: PRIORITIES });
  }
  if (!(SORTS as readonly string[]).includes(sort)) {
    throw new ValidationError("Недопустимое поле сортировки", { allowed: SORTS });
  }
  if (!(ORDERS as readonly string[]).includes(order)) {
    throw new ValidationError("Недопустимый порядок сортировки", { allowed: ORDERS });
  }

  return {
    status: status as TaskStatus | undefined,
    priority: priority as TaskPriority | undefined,
    assignee,
    search: params.get("search")?.trim() || undefined,
    sort: sort as ListTasksQuery["sort"],
    order: order as ListTasksQuery["order"],
    page: clampInt(params.get("page"), 1, 1, 1000),
    pageSize: clampInt(params.get("pageSize"), 20, 1, 100),
  };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
  dueDate: string | null;
}

function parseDueDate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ValidationError("dueDate должен быть строкой с датой");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new ValidationError("Некорректная дата в dueDate");
  return date.toISOString();
}

export function parseCreateTask(body: unknown): CreateTaskPayload {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Тело запроса должно быть объектом");
  }
  const record = body as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title.length < 3 || title.length > 200) {
    throw new ValidationError("Название должно содержать от 3 до 200 символов");
  }

  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (description.length > 2000) {
    throw new ValidationError("Описание не должно превышать 2000 символов");
  }

  const priority = (record.priority ?? "medium") as TaskPriority;
  if (!PRIORITIES.includes(priority)) {
    throw new ValidationError("Недопустимый приоритет", { allowed: PRIORITIES });
  }

  const assignee = typeof record.assignee === "string" && record.assignee.trim()
    ? record.assignee.trim()
    : "unassigned";
  if (assignee.length > 100) {
    throw new ValidationError("Исполнитель не должен превышать 100 символов");
  }

  return { title, description, priority, assignee, dueDate: parseDueDate(record.dueDate) };
}

export type UpdateTaskPayload = Partial<CreateTaskPayload> & { status?: TaskStatus };

export function parseUpdateTask(body: unknown): UpdateTaskPayload {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Тело запроса должно быть объектом");
  }
  const record = body as Record<string, unknown>;
  const patch: UpdateTaskPayload = {};

  if (record.status !== undefined) {
    const status = record.status as TaskStatus;
    if (!STATUSES.includes(status)) {
      throw new ValidationError("Недопустимый статус", { allowed: STATUSES });
    }
    patch.status = status;
  }

  if (record.priority !== undefined) {
    const priority = record.priority as TaskPriority;
    if (!PRIORITIES.includes(priority)) {
      throw new ValidationError("Недопустимый приоритет", { allowed: PRIORITIES });
    }
    patch.priority = priority;
  }

  if (record.title !== undefined) {
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (title.length < 3 || title.length > 200) {
      throw new ValidationError("Название должно содержать от 3 до 200 символов");
    }
    patch.title = title;
  }

  if (record.description !== undefined) {
    const description = typeof record.description === "string" ? record.description.trim() : "";
    if (description.length > 2000) {
      throw new ValidationError("Описание не должно превышать 2000 символов");
    }
    patch.description = description;
  }

  if (record.assignee !== undefined) {
    const assignee = typeof record.assignee === "string" ? record.assignee.trim() : "";
    if (assignee.length > 100) {
      throw new ValidationError("Исполнитель не должен превышать 100 символов");
    }
    patch.assignee = assignee || "unassigned";
  }

  if (record.dueDate !== undefined) {
    patch.dueDate = parseDueDate(record.dueDate);
  }

  return patch;
}
