import type { MiddlewareHandler } from "hono";
import { UnauthorizedError } from "../lib/errors";
import { verifyToken } from "../lib/auth";
import type { TokenPayload } from "../types";

/**
 * Разбирает Bearer-токен и кладёт пользователя в контекст.
 *
 * Не бросает ошибку, если токена нет: часть API (чтение задач, аналитика)
 * доступна без авторизации, чтобы демо открывалось сразу.
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (header && header.startsWith("Bearer ")) {
    const payload = await verifyToken(header.slice(7).trim(), c.env.JWT_SECRET);
    if (payload) c.set("user", payload);
  }
  await next();
};

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get("user") as TokenPayload | undefined;
  if (!user) throw new UnauthorizedError("Требуется вход в систему");
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get("user") as TokenPayload | undefined;
  if (!user) throw new UnauthorizedError("Требуется вход в систему");
  if (user.role !== "admin") throw new UnauthorizedError("Недостаточно прав");
  await next();
};

export function currentUser(c: { get: (key: string) => unknown }): TokenPayload | undefined {
  return c.get("user") as TokenPayload | undefined;
}
