import { Hono } from "hono";
import { ValidationError } from "../lib/errors";
import { currentUser, requireAuth } from "../middleware/auth";
import { UserRepository } from "../repositories/userRepository";
import { AuthService } from "../services/authService";
import type { Env } from "../types";

export function authRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("Тело запроса должно быть корректным JSON");
    }
    if (typeof body !== "object" || body === null) {
      throw new ValidationError("Тело запроса должно быть объектом");
    }

    const payload = body as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    const service = new AuthService(new UserRepository(c.env.DB), c.env.JWT_SECRET);
    return c.json(await service.login(email, password));
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
