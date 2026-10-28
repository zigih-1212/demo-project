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

export default function ActivityFeed() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity()
      .then((data) => {
        setItems(data.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">Лента активности</h2>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          Последние события
        </span>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400">
          Загрузка…
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-400">
          Событий пока нет
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((entry) => (
            <div
              key={entry.id}
              className="flex gap-3"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm">
                {entry.actorName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 leading-tight">
                  <span className="font-medium">{entry.actorName}</span>{" "}
                  {ACTION_LABEL[entry.action] ?? entry.action}
                  {entry.summary ? ` — ${entry.summary}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(entry.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
