import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { ActivityEntry } from "../types";

const ACTION_LABEL: Record<string, string> = {
  create: "Создал",
  status: "Изменил статус",
  update: "Обновил",
  delete: "Удалил",
  comment: "Прокомментировал",
};

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity()
      .then((data) => setItems(data.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Лента активности</h1>
      <p className="text-sm text-slate-500">
        История изменений задач: кто, что и когда сделал
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-96 flex items-center justify-center text-slate-400">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">Событий пока нет</div>
        ) : (
          <table className="w-full text-left text-sm divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-medium">Событие</th>
                <th className="px-6 py-4 font-medium hidden md:table-cell">Автор</th>
                <th className="px-6 py-4 font-medium hidden lg:table-cell">Действие</th>
                <th className="px-6 py-4 font-medium text-right">Когда</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-800">{e.summary}</div>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell text-slate-600">{e.actorName}</td>
                  <td className="px-6 py-4 hidden lg:table-cell text-slate-500">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">
                    {new Date(e.createdAt).toLocaleString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
