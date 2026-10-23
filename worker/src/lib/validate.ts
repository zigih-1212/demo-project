import { ValidationError } from "./errors";
import type { ListTasksQuery, TaskPriority, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export function parseListQuery(params: URLSearchParams): ListTasksQuery {
  const status = params.get("status") ?? undefined;
  const priority = params.get("priority") ?? undefined;
  const sort = params.get("sort") ?? "created_at";
  const order = params.get("order") ?? "desc";

  if (status && !STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError("Invalid status filter", { allowed: STATUSES });
  }
  if (priority && !PRIORITIES.includes(priority as TaskPriority)) {
    throw new ValidationError("Invalid priority filter", { allowed: PRIORITIES });
  }
  if (!["created_at", "priority", "title"].includes(sort)) {
    throw new ValidationError("Invalid sort field", { allowed: ["created_at", "priority", "title"] });
  }
  if (order !== "asc" && order !== "desc") {
    throw new ValidationError("Invalid sort order", { allowed: ["asc", "desc"] });
  }

  const page = clampInt(params.get("page"), 1, 1, 1000);
  const pageSize = clampInt(params.get("pageSize"), 20, 1, 100);

  return {
    status: status as TaskStatus | undefined,
    priority: priority as TaskPriority | undefined,
    search: params.get("search")?.trim() || undefined,
    sort: sort as ListTasksQuery["sort"],
    order: order as ListTasksQuery["order"],
    page,
    pageSize,
  };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
}

export function parseCreateTask(body: unknown): CreateTaskInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be an object");
  }
  const record = body as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title.length < 3 || title.length > 200) {
    throw new ValidationError("title must be between 3 and 200 characters");
  }

  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (description.length > 2000) {
    throw new ValidationError("description must not exceed 2000 characters");
  }

  const priority = (record.priority ?? "medium") as TaskPriority;
  if (!PRIORITIES.includes(priority)) {
    throw new ValidationError("Invalid priority", { allowed: PRIORITIES });
  }

  const assignee = typeof record.assignee === "string" ? record.assignee.trim() : "unassigned";
  if (assignee.length > 100) {
    throw new ValidationError("assignee must not exceed 100 characters");
  }

  return { title, description, priority, assignee };
}

export function parseUpdateTask(body: unknown, current: { status: TaskStatus; priority: TaskPriority }): Partial<CreateTaskInput> & { status?: TaskStatus } {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be an object");
  }
  const record = body as Record<string, unknown>;
  const patch: Partial<CreateTaskInput> & { status?: TaskStatus } = {};

  if (record.status !== undefined) {
    const status = record.status as TaskStatus;
    if (!STATUSES.includes(status)) {
      throw new ValidationError("Invalid status", { allowed: STATUSES });
    }
    patch.status = status;
  }

  if (record.priority !== undefined) {
    const priority = record.priority as TaskPriority;
    if (!PRIORITIES.includes(priority)) {
      throw new ValidationError("Invalid priority", { allowed: PRIORITIES });
    }
    patch.priority = priority;
  }

  if (record.title !== undefined) {
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (title.length < 3 || title.length > 200) {
      throw new ValidationError("title must be between 3 and 200 characters");
    }
    patch.title = title;
  }

  if (record.description !== undefined) {
    const description = typeof record.description === "string" ? record.description.trim() : "";
    if (description.length > 2000) {
      throw new ValidationError("description must not exceed 2000 characters");
    }
    patch.description = description;
  }

  if (record.assignee !== undefined) {
    const assignee = typeof record.assignee === "string" ? record.assignee.trim() : "";
    if (assignee.length > 100) {
      throw new ValidationError("assignee must not exceed 100 characters");
    }
    patch.assignee = assignee;
  }

  void current;
  return patch;
}