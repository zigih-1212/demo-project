import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useTaskSync } from "../hooks/useTaskSync";
import { useToast } from "./Toast";
import CreateTaskForm from "./CreateTaskForm";
import type { Task, TaskPriority, TaskStatus } from "../types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокировано",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-red-100 text-red-700",
};

const PAGE_SIZES = [10, 20, 50];

export default function TasksPage() {
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [assignee, setAssignee] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Дебаунц поиска: запрос к API — на паузе ввода, а не на каждую клавишу
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useMemo(
    () => ({
      status: status || undefined,
      priority: priority || undefined,
      assignee: assignee || undefined,
      search: search || undefined,
      sort: "created_at" as const,
      order: "desc" as const,
      page,
      pageSize,
    }),
    [status, priority, assignee, search, page, pageSize],
  );

  const { tasks, total, setTasks, loading, error, syncStatus, refresh } = useTaskSync(query);
  const { push } = useToast();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1); // смена фильтров — на первую страницу
  }, [status, priority, assignee, search, pageSize]);

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== task.id)); // оптимистично
    try {
      await api.deleteTask(task.id);
      push("Задача удалена", "success");
    } catch (err) {
      setTasks(prev); // откат при ошибке
      push(err instanceof Error ? err.message : "Не удалось удалить задачу", "error");
    }
  };

  const handleStatus = async (task: Task, next: TaskStatus) => {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await api.updateTask(task.id, { status: next });
      push("Статус обновлён", "success");
    } catch (err) {
      setTasks(prev); // откат при ошибке
      push(err instanceof Error ? err.message : "Не удалось изменить статус", "error");
    }
  };

  const filterCls =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Задачи</h1>
          <p className="text-sm text-slate-500">Управление списком задач в реальном времени</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
              syncStatus === "live-sse"
                ? "bg-emerald-50 text-emerald-700"
                : syncStatus === "live-poll"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${syncStatus === "connecting" ? "bg-slate-400" : "bg-current animate-pulse"}`}
            />
            {syncStatus === "live-sse" ? "Live (SSE)" : syncStatus === "live-poll" ? "Live (опрос)" : "Подключение…"}
          </span>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            Обновить
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="f-status" className="block text-xs font-medium text-slate-600 mb-1">
            Статус
          </label>
          <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | "")} className={filterCls}>
            <option value="">Все</option>
            <option value="todo">{STATUS_LABEL.todo}</option>
            <option value="in_progress">{STATUS_LABEL.in_progress}</option>
            <option value="done">{STATUS_LABEL.done}</option>
            <option value="blocked">{STATUS_LABEL.blocked}</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-priority" className="block text-xs font-medium text-slate-600 mb-1">
            Приоритет
          </label>
          <select id="f-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | "")} className={filterCls}>
            <option value="">Все</option>
            <option value="low">{PRIORITY_LABEL.low}</option>
            <option value="medium">{PRIORITY_LABEL.medium}</option>
            <option value="high">{PRIORITY_LABEL.high}</option>
            <option value="critical">{PRIORITY_LABEL.critical}</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-assignee" className="block text-xs font-medium text-slate-600 mb-1">
            Исполнитель
          </label>
          <select id="f-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={filterCls}>
            <option value="">Все</option>
            <option value="u-anna">Анна Ковалёва</option>
            <option value="u-dmitry">Дмитрий Соколов</option>
            <option value="u-admin">Дмитрий Выборных</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="f-search" className="block text-xs font-medium text-slate-600 mb-1">
            Поиск
          </label>
          <input
            id="f-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по названию…"
            className={`${filterCls} w-full`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Не удалось загрузить задачи</p>
              <p className="mt-1 text-xs text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              >
                Повторить
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500">Задач не найдено</p>
              <p className="mt-1 text-xs text-slate-400">Измените фильтры или создайте задачу через форму справа</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm divide-y divide-slate-100">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-medium">Задача</th>
                    <th className="px-6 py-4 font-medium">Статус</th>
                    <th className="px-6 py-4 font-medium hidden md:table-cell">Приоритет</th>
                    <th className="px-6 py-4 font-medium hidden lg:table-cell">Исполнитель</th>
                    <th className="px-6 py-4 font-medium hidden lg:table-cell">Создана</th>
                    <th className="px-6 py-4 font-medium">
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{t.title}</div>
                        {t.description && (
                          <div className="text-xs text-slate-500 mt-1 max-w-[400px] truncate">{t.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <label className="sr-only" htmlFor={`status-${t.id}`}>
                          Статус задачи
                        </label>
                        <select
                          id={`status-${t.id}`}
                          value={t.status}
                          onChange={(e) => {
                            void handleStatus(t, e.target.value as TaskStatus);
                          }}
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border-0 ${STATUS_BADGE[t.status]}`}
                        >
                          <option value="todo">{STATUS_LABEL.todo}</option>
                          <option value="in_progress">{STATUS_LABEL.in_progress}</option>
                          <option value="done">{STATUS_LABEL.done}</option>
                          <option value="blocked">{STATUS_LABEL.blocked}</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell text-slate-600">{t.assignee}</td>
                      <td className="px-6 py-4 hidden lg:table-cell text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            void handleDelete(t);
                          }}
                          aria-label={`Удалить задачу ${t.title}`}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && tasks.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                {total} задач · стр. {page} из {pages}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="text-xs">
                  На страницу:
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(p + 1, pages))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  Вперёд
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <CreateTaskForm onCreated={() => {
            void refresh();
          }} />
        </div>
      </div>
    </div>
  );
}
