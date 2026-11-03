import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { API_BASE } from "../env";
import { api, listTasksConditional } from "../services/api";
import type { ListTasksQuery, Task } from "../types";

export type SyncStatus = "connecting" | "live-sse" | "live-poll";

export interface TaskSync {
  tasks: Task[];
  total: number;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
  syncStatus: SyncStatus;
  refresh: () => Promise<void>;
}

const SSE_URL = `${API_BASE}/api/v1/sync/tasks/stream`;
const POLL_INTERVAL_MS = 3000;

/**
 * Синхронизация списка задач (см. ADR-014).
 *
 * Стратегия:
 * 1. SSE-стрим версий. Эндпоинт публичный и передаёт только номер версии
 *    (без данных задач) — EventSource не умеет заголовки, и в авторизации
 *    стрим не нуждается.
 * 2. При обрыве SSE — fallback-опрос /sync/version каждые 3 с.
 * 3. Любое изменение версии → условный GET списка с If-None-Match:
 *    304 = локальная копия актуальна, ноль трафика и рендера.
 *
 * `query` должен быть стабильным объектом (useMemo у вызывающей стороны):
 * смена запроса пересоздаёт SSE-подписку и сбрасывает ETag.
 */
export function useTaskSync(query: ListTasksQuery): TaskSync {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const etagRef = useRef<string | null>(null);
  const versionRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await listTasksConditional(query, etagRef.current);
      if (!mountedRef.current) return;
      if (res === null) return; // 304 — локальная копия актуальна
      setTasks(res.items);
      setTotal(res.total);
      etagRef.current = res.etag;
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Ошибка загрузки задач");
    }
  }, [query]);

  useEffect(() => {
    mountedRef.current = true;
    etagRef.current = null; // другой запрос — другой ETag
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let polling = false;

    const startPolling = () => {
      if (polling) return;
      polling = true;
      setSyncStatus("live-poll");
      pollTimer = setInterval(() => {
        api
          .syncVersion()
          .then((v) => {
            if (v.version !== versionRef.current) {
              versionRef.current = v.version;
              void refresh();
            }
          })
          .catch(() => {
            /* следующий тик повторит запрос */
          });
      }, POLL_INTERVAL_MS);
    };

    refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    es = new EventSource(SSE_URL);
    es.addEventListener("version", (raw) => {
      try {
        const data = JSON.parse((raw as MessageEvent<string>).data) as { version: number };
        if (data.version !== versionRef.current) {
          versionRef.current = data.version;
          void refresh();
        }
      } catch {
        /* повреждённое событие — следующий тик/опрос вернёт актуальную версию */
      }
    });
    es.onopen = () => {
      if (mountedRef.current && !polling) setSyncStatus("live-sse");
    };
    es.onerror = () => {
      es?.close();
      es = null;
      startPolling();
    };

    return () => {
      mountedRef.current = false;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [refresh]);

  return { tasks, total, setTasks, loading, error, syncStatus, refresh };
}
