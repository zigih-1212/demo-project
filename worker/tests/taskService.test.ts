import { describe, expect, it, vi } from "vitest";
import { TaskService } from "../src/services/taskService";
import { NotFoundError } from "../src/lib/errors";
import { CacheService } from "../src/lib/cache";
import type { Task } from "../src/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    title: "Задача",
    description: "",
    status: "todo",
    priority: "medium",
    assignee: "dmitry",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildService(task: Task | null) {
  const repository = {
    list: vi.fn().mockResolvedValue({
      items: task ? [task] : [],
      total: task ? 1 : 0,
      page: 1,
      pageSize: 20,
      pages: 1,
    }),
    findById: vi.fn().mockResolvedValue(task),
    create: vi.fn().mockImplementation(async (input) => makeTask({ id: "new", ...input })),
    update: vi.fn().mockImplementation(async (_id, patch) => makeTask({ ...(task ?? {}), ...patch })),
    remove: vi.fn().mockResolvedValue(true),
  };
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [] })),
  } as unknown as KVNamespace;
  const cache = new CacheService(kv);
  const queue = { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
  return { service: new TaskService(repository as never, cache, queue), repository, queue, store };
}

describe("TaskService", () => {
  it("отдаёт данные из кэша при повторном запросе", async () => {
    const { service, repository } = buildService(makeTask());
    await service.list({ sort: "created_at", order: "desc", page: 1, pageSize: 20 });
    await service.list({ sort: "created_at", order: "desc", page: 1, pageSize: 20 });
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it("инвалидирует кэш списка после создания задачи", async () => {
    const { service, repository } = buildService(makeTask());
    await service.list({ sort: "created_at", order: "desc", page: 1, pageSize: 20 });
    await service.create({ title: "Новая", description: "", priority: "low", assignee: "qa" });
    expect(repository.create).toHaveBeenCalled();
  });

  it("ставит задачу в очередь после создания", async () => {
    const { service, queue } = buildService(makeTask());
    await service.create({ title: "Новая", description: "", priority: "low", assignee: "qa" });
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.reindex" }),
    );
  });

  it("выбрасывает NotFoundError для несуществующей задачи", async () => {
    const { service } = buildService(null);
    await expect(service.get("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});