import { Hono } from "hono";
import { ValidationError, NotFoundError } from "../lib/errors";
import { optionalAuth, requireAuth, currentUser } from "../middleware/auth";
import { TaskRepository } from "../repositories/taskRepository";
import { TaskService } from "../services/taskService";
import { CacheService } from "../lib/cache";
import { ActivityRepository } from "../repositories/activityRepository";
import { parseCreateTask, parseListQuery, parseUpdateTask } from "../lib/validate";
import type { Env } from "../types";

function buildService(c: { env: Env }): TaskService {
  return new TaskService(
    new TaskRepository(c.env.DB),
    new CacheService(c.env.CACHE),
    c.env.QUEUE,
    new ActivityRepository(c.env.DB),
  );
}

export function taskRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.use("*", optionalAuth);

  routes.get("/", async (c) => {
    const query = parseListQuery(new URL(c.req.url).searchParams);
    return c.json(await buildService(c).list(query));
  });

  routes.get("/:id", async (c) => {
    return c.json(await buildService(c).get(c.req.param("id")));
  });

  routes.post(
    "/",
    requireAuth,
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ValidationError("Тело запроса должно быть корректным JSON");
      }
      const actor = currentUser(c);
      if (!actor) throw new ValidationError("Требуется авторизация");
      const task = await buildService(c).create(parseCreateTask(body), actor);
      return c.json(task, 201);
    },
  );

  routes.patch(
    "/:id",
    requireAuth,
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ValidationError("Тело запроса должно быть корректным JSON");
      }
      const actor = currentUser(c);
      if (!actor) throw new ValidationError("Требуется авторизация");
      const task = await buildService(c).update(
        c.req.param("id"),
        parseUpdateTask(body),
        actor,
      );
      return c.json(task);
    },
  );

  routes.delete(
    "/:id",
    requireAuth,
    async (c) => {
      const actor = currentUser(c);
      if (!actor) throw new ValidationError("Требуется авторизация");
      await buildService(c).remove(c.req.param("id"), actor);
      return c.json({ ok: true });
    },
  );

  return routes;
}
