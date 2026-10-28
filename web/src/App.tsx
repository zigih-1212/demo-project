import { useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import LoginForm from "./components/LoginForm";
import Dashboard from "./components/Dashboard";
import TasksPage from "./components/TasksPage";
import ActivityPage from "./components/ActivityPage";
import AuditPage from "./components/AuditPage";
import UsersPage from "./components/UsersPage";

export default function App() {
  const { isLoading, isAuthenticated, logout, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <LoginForm onSuccess={() => window.location.replace("/")} />
      </div>
    );
  }

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const path = window.location.pathname;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } bg-white border-r border-slate-200`}
      >
        <div className="flex h-full flex-col">
          <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                P
              </div>
              <span className="font-semibold text-slate-800 tracking-tight">
                Pulse Console
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-slate-600 lg:hidden"
              aria-label="Скрыть навигацию"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navItem("/", "Дашборд", "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1H6z")}
            {navItem("/tasks", "Задачи", "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01")}
            {navItem("/activity", "Активность", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z")}
            {navItem("/audit", "Аудит ИИ", "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z")}
            {navItem("/users", "Пользователи", "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2")}
          </nav>

          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                {(user?.name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { logout(); window.location.replace("/login"); }}
                className="text-xs text-slate-400 hover:text-red-600 transition-colors"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 z-30 hidden lg:block" aria-hidden="true">
          <div className="absolute inset-y-0 bg-white" />
        </div>

        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="text-slate-500 hover:text-slate-700 lg:hidden"
              aria-label="Открыть навигацию"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-slate-800">Pulse Console</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-500">API онлайн</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <PageRenderer path={path} />
        </main>
      </div>
    </div>
  );
}

function navItem(href: string, label: string, icon: string) {
  const active = window.location.pathname === href || (href !== "/" && window.location.pathname.startsWith(href));
  return (
    <a
      key={href}
      href={href}
      onClick={(e) => {
        if (href !== window.location.pathname) {
          window.location.href = href;
        }
      }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      <span>{label}</span>
    </a>
  );
}

function PageRenderer({ path }: { path: string }) {
  switch (path) {
    case "/tasks":
      return <TasksPage />;
    case "/activity":
      return <ActivityPage />;
    case "/audit":
      return <AuditPage />;
    case "/users":
      return <UsersPage />;
    default:
      return <Dashboard />;
  }
}
