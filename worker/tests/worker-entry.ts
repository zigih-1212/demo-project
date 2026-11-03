/**
 * Тестовая обёртка над реальным воркером.
 *
 * Miniflare в этой среде не поднимает нативный queues-брокер (зависает при
 * старте), а unsafe-binding с модулями игнорируется. Поэтому QUEUE binding
 * подменяется stub'ом на уровне env: fetch/queue обработчики реального
 * воркера (src/index.ts) выполняются без изменений, а транспорт очереди —
 * единственная заменяемая зависимость. Логика consumer тестируется
 * напрямую через processBatch() с настоящими D1/KV-дескрипторами.
 */
import worker from "../src/index";
import type { Env, TaskJob } from "../src/types";

const stubQueue = {
  send: async (message: TaskJob) => ({ messageId: "test-" + Math.random() }),
  sendBatch: async (messages: TaskJob[]) =>
    messages.map((message, index) => ({ id: String(index), message })),
} as unknown as Queue<TaskJob>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return worker.fetch(request, { ...env, QUEUE: stubQueue }, ctx);
  },
  async queue(batch: MessageBatch<TaskJob>, env: Env): Promise<void> {
    return worker.queue(batch, env);
  },
};
