import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { DashboardSummary, SummaryItem } from "../types";

export const CARD_STATS = [
  {
    label: "Всего задач",
    color: "text-slate-600",
    border: "border-slate-200",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    label: "В работе",
    color: "text-blue-600",
    border: "border-blue-100",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    label: "Готово",
    color: "text-emerald-600",
    border: "border-emerald-100",
    icon: "M5 13l4 4L19 7",
  },
  {
    label: "Просрочено",
    color: "text-red-600",
    border: "border-red-100",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

/**
 * Мини-график создания/выполнения задач по дням (SVG, без библиотек).
 * Демо-формат: до 14 точек, ось Y — количество задач.
 */
function TrendChart({ created, completed }: { created: SummaryItem[]; completed: SummaryItem[] }) {
  if (created.length === 0 && completed.length === 0) {
    return <p className="text-sm text-slate-400 py-10 text-center">Недостаточно данных для графика</p>;
  }

  const dates = Array.from(new Set([...created.map((d) => d.date), ...completed.map((d) => d.date)])).sort();
  const toMap = (items: SummaryItem[]) => new Map(items.map((i) => [i.date, i.count]));
  const createdMap = toMap(created);
  const completedMap = toMap(completed);
  const createdVals = dates.map((d) => createdMap.get(d) ?? 0);
  const completedVals = dates.map((d) => completedMap.get(d) ?? 0);

  const W = 560;
  const H = 180;
  const P = 28;
  const max = Math.max(1, ...createdVals, ...completedVals);
  const n = dates.length;
  const x = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(n / 7));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График создания и выполнения задач по дням">
        {[0, 0.5, 1].map((f) => {
          const gy = y(max * f);
          return (
            <g key={f}>
              <line x1={P} x2={W - P} y1={gy} y2={gy} stroke="#e2e8f0" strokeWidth="1" />
              <text x={P - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        <path d={line(createdVals)} fill="none" stroke="#2563eb" strokeWidth="2" />
        <path d={line(completedVals)} fill="none" stroke="#059669" strokeWidth="2" />
        {dates.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={d}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
            >
              {new Date(`${d}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" })}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Создано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-600 inline-block" /> Выполнено
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.summary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки метрик"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Обзор проекта</h2>
          <p className="text-sm text-slate-500">
            Реальные метрики из базы данных D1, обновляются через API
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="flex items-center justify-center h-64 text-slate-500">Загрузка метрик…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Не удалось загрузить метрики</h2>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          Повторить
        </button>
      </div>
    );
  }

  const total = summary?.total ?? 0;
  const done = summary?.byStatus.done ?? 0;
  const inProgress = (summary?.byStatus.in_progress ?? 0) + (summary?.byStatus.blocked ?? 0);

  const values: Record<string, number> = {
    "Всего задач": total,
    "В работе": inProgress,
    Готово: done,
    Просрочено: summary?.overdueCount ?? 0,
  };
  const deltas: Record<string, string> = {
    "Всего задач": `+${summary?.createdPerDay.reduce((s, d) => s + d.count, 0) ?? 0} за период`,
    "В работе": "не блокируется",
    Готово: `${summary?.completionRate ?? 0}% выполнено`,
    Просрочено: "требуют внимания",
  };

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
        {CARD_STATS.map((card) => (
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
              <span className="text-3xl font-bold text-slate-900">{values[card.label]}</span>
              <span className="text-xs text-slate-400">{deltas[card.label]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Создание и выполнение задач по дням
          </h3>
          <TrendChart
            created={summary?.createdPerDay ?? []}
            completed={summary?.completedPerDay ?? []}
          />
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
                      style={{ width: `${Math.max((count / Math.max(total, 1)) * 100, 5)}%` }}
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
