import { increment, setGauge } from "./metrics";
import { log } from "./logger";

/**
 * Circuit breaker для операций с Cloudflare KV.
 *
 * Зачем: KV — управляемый сервис, и изоляты Workers не должны падать или
 * «зависать» из-за его деградации. Брейкер накапливает последовательные
 * ошибки; после порога замыкается на cooldown и отдаёт fallback, не обращаясь
 * к KV. После cooldown пропускает одну пробную операцию (half-open): успех
 * закрывает брейкер, ошибка — снова замыкает.
 *
 * Состояние — module-level, то есть разделяется между всеми экземплярами
 * сервисов внутри одного изолята (а изолят живёт до нескольких минут и
 * обрабатывает много запросов). Между изолятами состояние не синхронизируется —
 * это осознанный компромисс: брейкер защищает изолят, а не весь кластер.
 */

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
}

const state: CircuitState = { consecutiveFailures: 0, openUntil: 0 };

const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

export class KvCircuitBreaker {
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(
    private readonly kv: KVNamespace,
    opts: { threshold?: number; cooldownMs?: number } = {},
  ) {
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async get(key: string): Promise<string | null> {
    return this.execute(() => this.kv.get(key), null);
  }

  async put(key: string, value: string, opts?: KVNamespacePutOptions): Promise<void> {
    await this.execute(() => this.kv.put(key, value, opts), undefined);
  }

  async del(key: string): Promise<void> {
    await this.execute(() => this.kv.delete(key), undefined);
  }

  get isDegraded(): boolean {
    return Date.now() < state.openUntil;
  }

  private async execute<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    if (this.isOpen()) {
      setGauge("kv_circuit_open", 1);
      return fallback;
    }
    try {
      const result = await op();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      return fallback;
    }
  }

  private isOpen(): boolean {
    return Date.now() < state.openUntil;
  }

  private recordSuccess(): void {
    if (state.consecutiveFailures > 0 || state.openUntil > 0) {
      state.consecutiveFailures = 0;
      state.openUntil = 0;
      log("info", "kv_circuit_closed");
    }
    setGauge("kv_circuit_open", 0);
  }

  private recordFailure(error: unknown): void {
    state.consecutiveFailures += 1;
    increment("kv_errors_total");
    log("warn", "kv_operation_failed", {
      message: error instanceof Error ? error.message : String(error),
      consecutiveFailures: state.consecutiveFailures,
    });
    if (state.consecutiveFailures >= this.threshold) {
      state.openUntil = Date.now() + this.cooldownMs;
      log("warn", "kv_circuit_opened", { cooldownMs: this.cooldownMs });
    }
  }
}

/** Глобальный признак деградации KV для /health и метрик. */
export function isKvDegraded(): boolean {
  return Date.now() < state.openUntil;
}
