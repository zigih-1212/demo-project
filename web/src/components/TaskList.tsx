import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Task } from "../types";

const STATUS_LABEL: Record<string, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокировано",
};

const STATUS_COLOR: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-red-100 text-red-700",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{
    status?: string;
    priority?: string;
    assignee?: string;
    search?: string;
    sort?: string;
    order?: string;
  }>({ sort: "created_at", order: "desc" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [page, pageSize, filters]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api.listTasks({
        ...filters,
        page,
        pageSize,
      });
      setTasks(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (task: Task, nextStatus: Task["status"]) => {
    try {
      const updated = await api.updateTask(task.id, { status: nextStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...updated } : t)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось обновить задачу");
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Удалить задачу?")) return;
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось удалить");
    }
  };

  const queryString = new URLSearchParams();
  if (filters.status) queryString.set("status", filters.status);
  if (filters.priority) queryString.set("priority", filters.priority);
  if (filters.assignee) queryString.set("assignee", filters.assignee);
  if (filters.search) queryString.set("search", filters.search);
  if (filters.sort) queryString.set("sort", filters.sort);
  if (filters.order) queryString.set("order", filters.order);
  queryString.set("page", String(page));
  queryString.set("pageSize", String(pageSize));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Задачи</h2>
          <p className="text-sm text-slate-500">
            {total} задач · стр. {page} из {pages}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Назад
          </button>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, pages))}
            disabled={page >= pages || loading}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Вперёд
          </button>
          <label className="flex items-center gap-2 px-2">
            <span className="text-xs text-slate-500">На страницу:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded text-sm border-slate-200 bg-white border px-2 py-1"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400">
          Загрузка…
        </div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          Задач не найдено
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-medium">Задача</th>
                <th className="px-6 py-4 font-medium hidden md:table-cell">Статус</th>
                <th className="px-6 py-4 font-medium hidden md:table-cell">Приоритет</th>
                <th className="px-6 py-4 font-medium hidden lg:table-cell">Исполнитель</th>
                <th className="px-6 py-4 font-medium hidden lg:table-cell">Создана</th>
                <th className="px-6 py-4 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50 group border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-800">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-slate-500 mt-1 max-w-[400px] truncate">
                        {task.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        toggleStatus(task, e.target.value as Task["status"])
                      }
                      className={`px-2 py-1 rounded text-xs font-medium border border-transparent transition-colors ${STATUS_COLOR[task.status]}`}
                    >
                      {[
                        "todo",
                        "in_progress",
                        "done",
                        "blocked",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLOR[task.priority]}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell text-slate-600">
                    {task.assignee === "unassigned" ? (
                      <span className="text-slate-400 italic">не назначен</span>
                    ) : (
                      task.assignee
                    )}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell text-slate-500">
                    {new Date(task.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
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
    </div>
  );
}
