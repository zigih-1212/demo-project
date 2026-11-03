import { Hono } from "hono";
import { ConflictError, ValidationError } from "../lib/errors";
import { currentUser, requireAuth } from "../middleware/auth";
import { UserRepository } from "../repositories/userRepository";
import { AuthService } from "../services/authService";
import { hashPassword } from "../lib/auth";
import { parseJsonBody } from "../lib/http";
import type { Env } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRegister(body: unknown): { email: string; name: string; password: string } {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Тело запроса должно быть объектом");
  }
  const record = body as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) throw new ValidationError("Введите корректный email");

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length < 2 || name.length > 100) {
    throw new ValidationError("Имя должно содержать от 2 до 100 символов");
  }

  const password = typeof record.password === "string" ? record.password : "";
  if (password.length < 8 || password.length > 200) {
    throw new ValidationError("Пароль должен содержать от 8 до 200 символов");
  }

  return { email, name, password };
}

export function authRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/login", async (c) => {
    const payload = await parseJsonBody(c);
    const email = typeof payload.email === "string" ? payload.email : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    const service = new AuthService(new UserRepository(c.env.DB), c.env.JWT_SECRET);
    return c.json(await service.login(email, password));
  });

  /**
   * Самостоятельная регистрация.
   *
   * Роль по умолчанию — member: админ не выдаётся через публичный endpoint.
   * Автоматический вход после регистрации (токен в ответе) — осознанное
   * решение для демо; в продакшене здесь был бы подтверждённый email.
   */
  routes.post("/register", async (c) => {
    const payload = await parseJsonBody(c);
    const { email, name, password } = parseRegister(payload);
    const users = new UserRepository(c.env.DB);

    const existing = await users.findByEmail(email);
    if (existing) throw new ConflictError("Пользователь с таким email уже зарегистрирован");

    const passwordHash = await hashPassword(password);
    const user = await users.create({
      id: crypto.randomUUID(),
      email,
      name,
      passwordHash,
      role: "member",
      team: "platform",
    });

    const service = new AuthService(users, c.env.JWT_SECRET);
    const { token, expiresAt } = await service.issueToken(user);
    return c.json({ token, expiresAt, user }, 201);
  });

  routes.get("/me", requireAuth, async (c) => {
    const token = currentUser(c);
    if (!token) throw new ValidationError("Требуется авторизация");

    const user = await new UserRepository(c.env.DB).findById(token.sub);
    return c.json({ user: user ?? token });
  });

  routes.get("/users", requireAuth, async (c) => {
    return c.json({ items: await new UserRepository(c.env.DB).list() });
  });

  return routes;
}
