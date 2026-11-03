import { useState } from "react";
import { api } from "../services/api";
import { useToast } from "./Toast";
import type { TaskPriority } from "../types";

/**
 * Форма быстрого создания задачи. Клиентская валидация (мин. 3 символа)
 * дублирует серверную — UX не ждёт ответа API на очевидные ошибки.
 */
export default function CreateTaskForm({ onCreated }: { onCreated: () => void }) {
  const { push } = useToast();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [titleError, setTitleError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setTitleError("Название — минимум 3 символа");
      return;
    }
    setTitleError("");
    setCreating(true);
    try {
      await api.createTask({
        title: trimmed,
        priority,
        assignee: assignee || undefined,
        description: "",
        dueDate: null,
      });
      setTitle("");
      push("Задача создана", "success");
      onCreated();
    } catch (err) {
      push(err instanceof Error ? err.message : "Не удалось создать задачу", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">
        Быстрое создание
      </h3>
      <div>
        <label htmlFor="quick-title" className="block text-xs font-medium text-slate-600 mb-1">
          Название
        </label>
        <input
          id="quick-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!titleError}
          aria-describedby={titleError ? "quick-title-err" : undefined}
          placeholder="Название задачи"
          className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            titleError ? "border-red-400 bg-red-50" : "border-slate-300 bg-slate-50"
          }`}
        />
        {titleError && (
          <p id="quick-title-err" role="alert" className="mt-1 text-xs text-red-600">
            {titleError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="quick-priority" className="block text-xs font-medium text-slate-600 mb-1">
          Приоритет
        </label>
        <select
          id="quick-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
          <option value="critical">Критический</option>
        </select>
      </div>
      <div>
        <label htmlFor="quick-assignee" className="block text-xs font-medium text-slate-600 mb-1">
          Исполнитель
        </label>
        <select
          id="quick-assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">Не назначен</option>
          <option value="u-anna">Анна Ковалёва</option>
          <option value="u-dmitry">Дмитрий Соколов</option>
          <option value="u-admin">Дмитрий Выборных</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={creating}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        {creating ? "…" : "Создать"}
      </button>
    </form>
  );
}
