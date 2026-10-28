import { CacheService } from "../lib/cache";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { increment, observe } from "../lib/metrics";
import { ActivityRepository } from "../repositories/activityRepository";
import { TaskRepository, type CreateTaskInput, type UpdateTaskInput } from "../repositories/taskRepository";
import type { AuthUser, ListTasksQuery, Paginated, Task } from "../types";

const LIST_CACHE_TTL = 60;
const STATUS_LABELS: Record<string, string> = {
  todo: "к выполнению",
  in_progress: "в работу",
  done: "готово",
  blocked: "заблокировано",
};

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly cache: CacheService,
    private readonly queue: Queue,
    private readonly activity: ActivityRepository,
  ) {}

  async list(query: ListTasksQuery): Promise<Paginated<Task>> {
    const cacheKey = JSON.stringify(query);
    const cached = await this.cache.getVersioned<Paginated<Task>>("tasks:list", hashKey(cacheKey));
    if (cached) {
      increment("cache_hits_total", { namespace: "tasks:list" });
      return cached;
    }
    increment("cache_misses_total", { namespace: "tasks:list" });

    const started = Date.now();
    const result = await this.repository.list(query);
    observe("repository_query_duration_seconds", (Date.now() - started) / 1000, { operation: "list" });

    await this.cache.setVersioned("tasks:list", hashKey(cacheKey), result, {
      ttlSeconds: LIST_CACHE_TTL,
      prefix: "tasks:list",
    });
    return result;
  }

  async get(id: string): Promise<Task> {
    const cached = await this.cache.getVersioned<Task>("tasks:item", id);
    if (cached) {
      increment("cache_hits_total", { namespace: "tasks:item" });
      return cached;
    }
    increment("cache_misses_total", { namespace: "tasks:item" });

    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError("Task");
    await this.cache.setVersioned("tasks:item", id, task, { ttlSeconds: 60, prefix: "tasks:item" });
    return task;
  }

  async create(input: CreateTaskInput, actor: AuthUser): Promise<Task> {
    const task = await this.repository.create({ ...input, createdBy: actor.id });

    await this.invalidate();
    increment("tasks_created_total", { priority: task.priority });
    await this.queue.send({ type: "task.reindex", taskId: task.id, requestedAt: new Date().toISOString() });
    await this.activity.record({
      taskId: task.id,
      actorId: actor.id,
      action: "create",
      summary: `${actor.name} создал задачу «${task.title}»`,
    });

    return task;
  }

  async update(id: string, patch: UpdateTaskInput, actor: AuthUser): Promise<Task> {
    const current = await this.repository.findById(id);
    if (!current) throw new NotFoundError("Task");
    this.assertCanMutate(current, actor);

    const task = await this.repository.update(id, patch);
    if (!task) throw new NotFoundError("Task");

    await this.invalidate();
    increment("tasks_updated_total", { status: task.status });

    const statusChanged = patch.status !== undefined && patch.status !== current.status;
    await this.activity.record({
      taskId: task.id,
      actorId: actor.id,
      action: statusChanged ? "status" : "update",
      summary: statusChanged
        ? `${actor.name} перевёл «${task.title}» в «${STATUS_LABELS[task.status] ?? task.status}»`
        : `${actor.name} обновил «${task.title}»`,
    });

    return task;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError("Task");
    this.assertCanMutate(task, actor);

    const deleted = await this.repository.remove(id);
    if (!deleted) throw new NotFoundError("Task");

    await this.invalidate();
    increment("tasks_deleted_total", {});
    await this.activity.record({
      taskId: null,
      actorId: actor.id,
      action: "delete",
      summary: `${actor.name} удалил задачу «${task.title}»`,
    });
  }

  private assertCanMutate(task: Task, actor: AuthUser): void {
    if (actor.role === "admin") return;
    if (task.createdBy === actor.id) return;
    if (task.assignee === actor.id) return;
    throw new ForbiddenError("Можно изменять только свои задачи");
  }

  private async invalidate(): Promise<void> {
    await this.cache.invalidateNamespace("tasks:list");
    await this.cache.invalidateNamespace("tasks:stats");
    await this.cache.invalidateNamespace("tasks:item");
  }
}

function hashKey(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
