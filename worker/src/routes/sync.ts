import { Hono } from "hono";
import { SyncRepository } from "../repositories/syncRepository";
import type { Env } from "../types";

/**
 * Кросс-изолятная синхронизация клиента.
 *
 * Workers изолированы: SSE-подключение и мутация задачи почти наверняка
 * исполняются в разных изолятах, поэтому единственный источник истины —
 * D1 (строгая консистентность в регионе). Мутации инкрементируют
 * sync_state.tasks_version; клиент либо слушает SSE-стрим, либо опрашивает
 * версию, либо использует ETag на списке задач (см. routes/tasks.ts).
 *
 * SSE-стрим здесь полирует D1 раз в 1.5 с на соединение. Это осознанный
 * компромисс для демо-масштаба (десятки одновременных зрителей): он даёт
 * live-обновления без Durable Object. При росте нагрузки правильный путь —
 * Durable Object, держащий подключения и получающий версию из очереди
 * (см. ADR-014).
 */

const SSE_MAX_DURATION_MS = 25_000;
const POLL_INTERVAL_MS = 1_500;
const HEARTBEAT_INTERVAL_MS = 10_000;

export function syncRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/version", async (c) => {
    const sync = new SyncRepository(c.env.DB);
    const version = await sync.getVersion("tasks_version");
    return c.json({ key: "tasks_version", version, ts: new Date().toISOString() });
  });

  routes.get("/tasks/stream", async (c) => {
    const sync = new SyncRepository(c.env.DB);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let lastVersion = await sync.getVersion("tasks_version");
        send("version", { version: lastVersion });

        let lastHeartbeat = Date.now();
        const deadline = Date.now() + SSE_MAX_DURATION_MS;

        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

          try {
            const version = await sync.getVersion("tasks_version");
            if (version !== lastVersion) {
              lastVersion = version;
              send("version", { version });
            }
          } catch {
            // Пропускаем тик — следующий опрос вернёт актуальную версию.
          }

          if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            lastHeartbeat = Date.now();
            send("ping", { ts: Date.now() });
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  return routes;
}
