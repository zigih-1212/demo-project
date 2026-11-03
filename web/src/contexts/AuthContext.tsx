import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser } from "../types";
import { api } from "../services/api";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("pulse_token");
    const storedUser = localStorage.getItem("pulse_user");
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("pulse_token");
        localStorage.removeItem("pulse_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    persistSession(res);
  };

  const register = async (email: string, name: string, password: string) => {
    // Бэкенд возвращает токен сразу (201) — регистрация открывает сессию
    const res = await api.register({ email, name, password });
    persistSession(res);
  };

  const logout = () => {
    localStorage.removeItem("pulse_token");
    localStorage.removeItem("pulse_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function persistSession(res: { token: string; user: AuthUser }) {
  localStorage.setItem("pulse_token", res.token);
  localStorage.setItem("pulse_user", JSON.stringify(res.user));
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
