import { describe, expect, it, vi } from "vitest";
import { CacheService } from "../src/lib/cache";

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as KVNamespace,
  };
}

describe("CacheService", () => {
  it("возвращает сохранённое значение", async () => {
    const { kv } = makeKv();
    const cache = new CacheService(kv);
    await cache.set("ns", "key", { value: 1 }, { ttlSeconds: 60, prefix: "ns" });
    expect(await cache.get("ns", "key")).toEqual({ value: 1 });
  });

  it("не находит удалённое значение", async () => {
    const { kv } = makeKv();
    const cache = new CacheService(kv);
    await cache.set("ns", "key", { value: 1 }, { ttlSeconds: 60, prefix: "ns" });
    await cache.invalidate("ns", "key");
    expect(await cache.get("ns", "key")).toBeNull();
  });

  it("инвалидирует все записи namespace сразу, без листинга ключей", async () => {
    const { kv, store } = makeKv();
    const cache = new CacheService(kv);
    await cache.setVersioned("tasks:list", "a", 1, { ttlSeconds: 60, prefix: "tasks:list" });
    await cache.setVersioned("tasks:list", "b", 2, { ttlSeconds: 60, prefix: "tasks:list" });
    expect(await cache.getVersioned("tasks:list", "a")).toBe(1);

    await cache.invalidateNamespace("tasks:list");

    expect(await cache.getVersioned("tasks:list", "a")).toBeNull();
    expect(await cache.getVersioned("tasks:list", "b")).toBeNull();
    expect(store.size).toBeLessThanOrEqual(3);
  });

  it("не вызывает list при инвалидации (KV eventually consistent)", async () => {
    const { kv } = makeKv();
    const list = vi.fn();
    (kv as unknown as { list: unknown }).list = list;
    const cache = new CacheService(kv);
    await cache.invalidateNamespace("tasks:list");
    expect(list).not.toHaveBeenCalled();
  });
});