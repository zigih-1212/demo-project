/**
 * Кэш на KV с версионированием по namespace.
 *
 * Изначально инвалидация была через list+delete, но KV в Cloudflare
 * eventually consistent: только что записанный ключ ещё не виден в
 * листинге, поэтому он не удалялся и из кэша отдавались устаревшие данные.
 *
 * Вместо удаления ключей используется счётчик версий namespace: он лежит
 * в одном ключе, обновляется атомарно и мгновенно делает все старые записи
 * недостижимыми. Старые ключи истекают по TTL.
 */
export interface CacheOptions {
  ttlSeconds: number;
  prefix: string;
}

const VERSION_PREFIX = "cachever:";
const VERSION_TTL_SECONDS = 86400;

export class CacheService {
  constructor(private readonly kv: KVNamespace) {}

  private key(namespace: string, id: string): string {
    return namespace + ":" + id;
  }

  async get<T>(namespace: string, id: string): Promise<T | null> {
    const raw = await this.kv.get(this.key(namespace, id));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(namespace: string, id: string, value: T, options: CacheOptions): Promise<void> {
    await this.kv.put(this.key(namespace, id), JSON.stringify(value), {
      expirationTtl: options.ttlSeconds,
    });
  }

  async invalidate(namespace: string, id: string): Promise<void> {
    await this.kv.delete(this.key(namespace, id));
  }

  private async version(namespace: string): Promise<string> {
    const value = await this.kv.get(VERSION_PREFIX + namespace);
    return value ?? "0";
  }

  async getVersioned<T>(namespace: string, id: string): Promise<T | null> {
    const version = await this.version(namespace);
    return this.get<T>(namespace, version + ":" + id);
  }

  async setVersioned<T>(
    namespace: string,
    id: string,
    value: T,
    options: CacheOptions,
  ): Promise<void> {
    const version = await this.version(namespace);
    await this.set<T>(namespace, version + ":" + id, value, options);
  }

  /**
   * Инвалидирует все записи namespace одной операцией.
   *
   * Счётчик версий растёт, поэтому старые ключи становятся недостижимыми
   * сразу, без ожидания распространения индекса KV.
   */
  async invalidateNamespace(namespace: string): Promise<void> {
    const current = await this.version(namespace);
    const next = (Number.parseInt(current, 10) || 0) + 1;
    await this.kv.put(VERSION_PREFIX + namespace, String(next), {
      expirationTtl: VERSION_TTL_SECONDS,
    });
  }
}