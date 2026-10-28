import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { DashboardSummary } from "../types";

export const CARD_STATS = [
  {
    label: "Всего задач",
    value: "0",
    delta: "+0 за неделю",
    color: "text-slate-600",
    border: "border-slate-200",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    label: "В работе",
    value: "0",
    delta: "не блокируется",
    color: "text-blue-600",
    border: "border-blue-100",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    label: "Готово",
    value: "0",
    delta: "0% выполнено",
    color: "text-emerald-600",
    border: "border-emerald-100",
    icon: "M5 13l4 4L19 7",
  },
  {
    label: "Просрочено",
    value: "0",
    delta: "требуют внимания",
    color: "text-red-600",
    border: "border-red-100",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.summary()
      .then((data) => {
        setSummary(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        Загрузка метрик…
      </div>
    );
  }

  const total = summary?.total ?? 0;
  const done = summary?.byStatus.done ?? 0;
  const inProgress =
    (summary?.byStatus.in_progress ?? 0) + (summary?.byStatus.blocked ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Обзор проекта</h2>
          <p className="text-sm text-slate-500">
            Реальные метрики из базы данных D1, обновляются через API
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-slate-400">Обновлено через кэш (TTL 60с)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARD_STATS.map((card, i) => (
          <div
            key={card.label}
            className={`rounded-2xl p-4 border ${card.border} bg-white shadow-sm`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">{card.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900">
                {card.label === "Готово" ? summary?.byStatus.done : card.label === "Всего задач" ? total : card.label === "В работе" ? inProgress : summary?.overdueCount}
              </span>
              <span className="text-xs text-slate-400">{card.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Постановка и выполнение задач
          </h3>
          <div className="h-64 flex items-center justify-center">
            <canvas id="burndown" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Распределение по статусам
          </h3>
          <div className="space-y-3">
            {Object.entries(summary?.byStatus ?? {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{status}</span>
                <div className="flex-1 ml-4">
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: Math.max((count / total) * 100, 5) }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
