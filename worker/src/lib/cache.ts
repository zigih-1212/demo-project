export interface CacheOptions {
  ttlSeconds: number;
  prefix: string;
}

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

  async invalidatePattern(namespace: string): Promise<void> {
    const keys = await this.kv.list({ prefix: namespace + ":" });
    if (keys.keys.length === 0) return;
    await Promise.all(keys.keys.map((entry) => this.kv.delete(entry.name)));
  }
}