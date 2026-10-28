import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { TaskStatus } from "../types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокировано",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTasks({ pageSize: 50 })
      .then((data) => {
        setTasks(data.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Задачи</h1>
          <p className="text-sm text-slate-500">Управление списком задач в реальном времени</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          {loading ? (
            <div className="h-96 flex items-center justify-center text-slate-400">Загрузка…</div>
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
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'done' ? 'bg-emerald-100 text-emerald-700' : t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : t.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          {STATUS_LABEL[t.status as TaskStatus]}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${t.priority === 'critical' ? 'bg-red-100 text-red-700' : t.priority === 'high' ? 'bg-orange-100 text-orange-700' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell text-slate-600">{t.assignee}</td>
                      <td className="px-6 py-4 hidden lg:table-cell text-slate-500">{new Date(t.createdAt).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <CreateTaskFormInline />
        </div>
      </div>
    </div>
  );
}

function CreateTaskFormInline() {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("unassigned");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.createTask({ title, priority, assignee: assignee || undefined, description: "", dueDate: null });
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">Быстрое создание</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи"
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <option value="low">Низкий</option>
        <option value="medium">Средний</option>
        <option value="high">Высокий</option>
        <option value="critical">Критический</option>
      </select>
      <select
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <option value="unassigned">Не назначен</option>
        <option value="u-anna">Анна Ковалёва</option>
        <option value="u-dmitry">Дмитрий Соколов</option>
        <option value="u-admin">Дмитрий Выборных</option>
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "…" : "Создать"}
      </button>
    </form>
  );
}
