/**
 * Счётчики версий в D1 — единственный источник истины для инвалидации
 * кэша на клиенте (ETag) и для SSE-трансляции изменений.
 *
 * D1 даёт строгую консистентность в пределах региона, в отличие от KV,
 * поэтому именно он, а не KV, используется для версий.
 */
export class SyncRepository {
  constructor(private readonly db: D1Database) {}

  async getVersion(key: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT value FROM sync_state WHERE key = ?")
      .bind(key)
      .first<{ value: number }>();
    return row?.value ?? 0;
  }

  /**
   * Атомарно инкрементирует версию и возвращает новое значение.
   * Используется после каждой мутации задач.
   */
  async bumpVersion(key: string): Promise<number> {
    await this.db
      .prepare(
        "INSERT INTO sync_state (key, value, updated_at) VALUES (?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')) " +
          "ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      )
      .bind(key)
      .run();
    const row = await this.db
      .prepare("SELECT value FROM sync_state WHERE key = ?")
      .bind(key)
      .first<{ value: number }>();
    return row?.value ?? 1;
  }
}
