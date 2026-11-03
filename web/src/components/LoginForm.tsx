import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

type Mode = "login" | "register";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (mode === "register" && name.trim().length < 2) {
      errs.name = "Укажите имя (мин. 2 символа)";
    }
    if (!EMAIL_RE.test(email)) {
      errs.email = "Введите корректный email";
    }
    if (password.length < 6) {
      errs.password = "Пароль — минимум 6 символов";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        setSuccess("Вход выполнен успешно! Перенаправление...");
      } else {
        await register(email, name.trim(), password);
        setSuccess("Аккаунт создан и выполнен вход. Перенаправление...");
      }
      setTimeout(() => onSuccess(), 500);
    } catch (err) {
      setFieldErrors({});
      setError(
        err instanceof Error ? err.message : mode === "login" ? "Ошибка входа" : "Ошибка регистрации",
      );
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (invalid: boolean) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all disabled:opacity-60 ${
      invalid ? "border-red-400 bg-red-50" : "border-slate-300 bg-slate-50"
    }`;

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 text-xl">
              P
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Вход в Pulse Console" : "Регистрация в Pulse Console"}
            </h2>
            <p className="mt-2 text-slate-500 text-sm">
              {mode === "login"
                ? "Введите учётные данные, чтобы открыть дашборд задач"
                : "Создайте аккаунт — регистрация открывает сессию сразу"}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === "register" && (
              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Имя
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "reg-name-err" : undefined}
                  className={inputCls(!!fieldErrors.name)}
                  placeholder="Иван Иванов"
                />
                {fieldErrors.name && (
                  <p id="reg-name-err" className="mt-1 text-xs text-red-600">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Рабочая почта
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "auth-email-err" : undefined}
                className={inputCls(!!fieldErrors.email)}
                placeholder="anna@pulse.dev"
              />
              {fieldErrors.email && (
                <p id="auth-email-err" className="mt-1 text-xs text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Пароль
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "auth-password-err" : undefined}
                className={inputCls(!!fieldErrors.password)}
                placeholder="••••••••"
              />
              {fieldErrors.password && (
                <p id="auth-password-err" className="mt-1 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "…" : mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setFieldErrors({});
              }}
              className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
            >
              {mode === "login" ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Вход"}
            </button>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm text-slate-500">Демо-аккаунты:</p>
            <ul className="mt-2 text-xs text-slate-400 space-y-1">
              <li>admin@pulse.dev / demo1234 (владелец)</li>
              <li>anna@pulse.dev / demo1234 (frontend)</li>
              <li>dmitry@pulse.dev / demo1234 (backend)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
