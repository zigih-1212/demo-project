import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { TaskStatus } from "../types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокировано",
};

export default function AuditPage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAudit = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetch("https://demo-fullstack-backend.dvybornyh332.workers.dev/api/v1/analytics/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!data.ok) throw new Error("Аудит не удался");
      const result = await data.json();
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка аудита");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Аудит ИИ-агента</h1>
          <p className="text-sm text-slate-500">
            Автоматическая проверка схемы БД, индексов и качества данных с планом рефакторинга
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-all"
        >
          {loading ? "Выполняется…" : "Запустить аудит"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>
      )}

      {!report && <div className="h-64 flex items-center justify-center text-slate-400">Загрузка…</div>}

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="text-4xl font-bold text-slate-800">{report.score}</div>
              <div>
                <span className="text-xs text-slate-400">из 100</span>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-1">
                  <div
                    className={`h-2 rounded-full ${report.score >= 80 ? 'bg-emerald-500' : report.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: Math.max(report.score, 5) + "%" }}
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">{report.summary}</p>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-slate-800 uppercase tracking-wider">Найденные проблемы</h3>
              {report.findings && report.findings.length > 0 ? (
                report.findings.map((f: any, i: number) => (
                  <div key={i} className="mb-3 p-3 rounded-lg border-l-3 border-slate-200 bg-slate-50">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase ${f.severity === 'critical' ? 'text-red-600' : f.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
                        {f.severity}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">{f.category}</span>
                    </div>
                    <div className="text-sm text-slate-700">{f.message}</div>
                    <div className="text-xs text-slate-500 mt-1">{f.location}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-emerald-600">Проблем не найдено</div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800 uppercase tracking-wider">План рефакторинга</h3>
              {report.refactoringPlan && report.refactoringPlan.length > 0 ? (
                report.refactoringPlan.map((step: any, i: number) => (
                  <div key={i} className="mb-3 flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      {step.step}
                    </div>
                    <div>
                      <div className="text-sm text-slate-800 font-medium">{step.action}</div>
                      <div className="text-xs text-slate-500">{step.rationale}</div>
                      <div className="text-xs text-slate-400 mt-1">Трудоёмкость: {step.effort}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-emerald-600">План не требуется</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <h3 className="mb-4 text-sm font-bold text-slate-800 uppercase tracking-wider">Детали проверки</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Проверок выполнено</span>
                <span className="font-medium text-slate-900">{report.checksRun}</span>
              </div>
              <div className="flex justify-between">
                <span>Найдено замечаний</span>
                <span className="font-medium text-slate-900">{report.findings?.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Критических</span>
                <span className={`font-medium ${report.findings?.filter((f:any)=>f.severity==='critical').length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {report.findings?.filter((f:any)=>f.severity==='critical').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Предупреждений</span>
                <span className="font-medium text-slate-900">{report.findings?.filter((f:any)=>f.severity==='warning').length}</span>
              </div>
              <div className="flex justify-between">
                <span>Сгенерировано</span>
                <span className="font-medium text-slate-900 text-xs">{new Date(report.generatedAt).toLocaleString('ru-RU')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
