import { CacheService } from "../lib/cache";
import { increment, observe } from "../lib/metrics";
import { NotFoundError } from "../lib/errors";
import { TaskRepository } from "../repositories/taskRepository";
import type { ListTasksQuery, Paginated, Task } from "../types";

const LIST_CACHE_TTL = 60;
const STATS_CACHE_TTL = 60;

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly cache: CacheService,
    private readonly queue: Queue,
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

    await this.cache.setVersioned("tasks:list", hashKey(cacheKey), result, { ttlSeconds: LIST_CACHE_TTL, prefix: "tasks:list" });
    return result;
  }

  async get(id: string): Promise<Task> {
    const cached = await this.cache.get<Task>("tasks:item", id);
    if (cached) {
      increment("cache_hits_total", { namespace: "tasks:item" });
      return cached;
    }
    increment("cache_misses_total", { namespace: "tasks:item" });

    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError("Task");
    await this.cache.set("tasks:item", id, task, { ttlSeconds: 60, prefix: "tasks:item" });
    return task;
  }

  async create(input: {
    title: string;
    description: string;
    priority: string;
    assignee: string;
  }): Promise<Task> {
    const task = await this.repository.create(input as never);
    await this.invalidateLists();
    await this.cache.set("tasks:item", task.id, task, { ttlSeconds: 60, prefix: "tasks:item" });

    await this.queue.send({ type: "task.reindex", taskId: task.id, requestedAt: new Date().toISOString() });
    increment("tasks_created_total", { priority: task.priority });
    return task;
  }

  async update(
    id: string,
    patch: { title?: string; description?: string; status?: string; priority?: string; assignee?: string },
  ): Promise<Task> {
    const current = await this.repository.findById(id);
    if (!current) throw new NotFoundError("Task");

    const task = await this.repository.update(id, patch as never);
    if (!task) throw new NotFoundError("Task");

    await this.invalidateLists();
    await this.cache.set("tasks:item", id, task, { ttlSeconds: 60, prefix: "tasks:item" });
    return task;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.remove(id);
    if (!deleted) throw new NotFoundError("Task");
    await this.invalidateLists();
    await this.cache.invalidate("tasks:item", id);
    increment("tasks_deleted_total", {});
  }

  private async invalidateLists(): Promise<void> {
    await this.cache.invalidateNamespace("tasks:list");
    await this.cache.invalidateNamespace("tasks:stats");
  }
}

function hashKey(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}