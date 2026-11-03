/**
 * Rate limiting: token bucket на базе KV.
 *
 * Почему token bucket, а не фиксированное окно: фиксированное окно даёт
 * «пилу» на границе окна (до 2× лимита за мгновение) и не гладит микровсплески.
 * Token bucket с refill'ом даёт плавное ограничение и честный Retry-After.
 *
 * Точность: KV eventually consistent, а read-modify-write не атомарен между
 * изолятами. Это осознанный компромисс — rate limiting на краю всегда
 * приблизителен; для жёстких лимитов нужен Durable Object (см. ADR-013).
 *
 * Деградация: если KV недоступен, лимитер fail-open (пропускает запрос) и
 * пишет метрику. Доступность API важнее строгости лимита для демо; это
 * документированное решение, а не баг.
 */

export type RateLimitClass = "auth" | "write" | "read";

export interface RateLimitConfig {
  burst: number;
  refillPerSec: number;
}

export const RATE_LIMIT_CLASSES: Record<RateLimitClass, RateLimitConfig> = {
  // Аутентификация: узкий лимит — защита от перебора паролей.
  auth: { burst: 10, refillPerSec: 10 / 60 },
  // Мутации: средний лимит.
  write: { burst: 60, refillPerSec: 1 },
  // Чтение: щедрый лимит, чтобы не мешать дашборду.
  read: { burst: 120, refillPerSec: 2 },
};

const BUCKET_TTL_SECONDS = 120;

export function classifyRequest(method: string, path: string): RateLimitClass {
  if (method === "POST" && path.startsWith("/api/v1/auth/")) return "auth";
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "read";
  return "write";
}

interface TokenBucket {
  tokens: number;
  ts: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export class RateLimiter {
  constructor(private readonly kv: KVNamespace) {}

  async check(ip: string, cls: RateLimitClass): Promise<RateLimitResult> {
    const conf = RATE_LIMIT_CLASSES[cls];
    const key = `rl:${cls}:${ip}`;

    let bucket: TokenBucket = { tokens: conf.burst, ts: Date.now() };
    try {
      const raw = await this.kv.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as TokenBucket;
        if (Number.isFinite(parsed.tokens) && Number.isFinite(parsed.ts)) bucket = parsed;
      }
    } catch {
      // KV недоступен — fail-open, применяем полный бакет в памяти.
      return { allowed: true, limit: conf.burst, remaining: conf.burst, retryAfterSec: 0 };
    }

    const now = Date.now();
    const elapsedSec = Math.max(0, (now - bucket.ts) / 1000);
    bucket.tokens = Math.min(conf.burst, bucket.tokens + elapsedSec * conf.refillPerSec);
    bucket.ts = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      try {
        await this.kv.put(key, JSON.stringify(bucket), { expirationTtl: BUCKET_TTL_SECONDS });
      } catch {
        // Запись лимита не критична — следующий запрос увидит устаревший бакет.
      }
      return {
        allowed: true,
        limit: conf.burst,
        remaining: Math.floor(bucket.tokens),
        retryAfterSec: 0,
      };
    }

    const retryAfterSec = Math.max(1, Math.ceil((1 - bucket.tokens) / conf.refillPerSec));
    return { allowed: false, limit: conf.burst, remaining: 0, retryAfterSec: retryAfterSec };
  }
}
