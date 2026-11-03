import { Hono } from "hono";
import { ValidationError, NotFoundError } from "../lib/errors";
import { optionalAuth, requireAuth, currentUser } from "../middleware/auth";
import { TaskRepository } from "../repositories/taskRepository";
import { SyncRepository } from "../repositories/syncRepository";
import { TaskService } from "../services/taskService";
import { CacheService } from "../lib/cache";
import { ActivityRepository } from "../repositories/activityRepository";
import { parseCreateTask, parseListQuery, parseUpdateTask } from "../lib/validate";
import { parseJsonBody } from "../lib/http";
import type { Env } from "../types";

function buildService(c: { env: Env }): TaskService {
  return new TaskService(
    new TaskRepository(c.env.DB),
    new CacheService(c.env.CACHE),
    c.env.QUEUE,
    new ActivityRepository(c.env.DB),
    new SyncRepository(c.env.DB),
  );
}

/** Хэш параметров запроса — часть ETag, чтобы разные фильтры не конфликтовали. */
function hashQuery(query: unknown): string {
  const input = JSON.stringify(query);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function taskRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.use("*", optionalAuth);

  routes.get("/", async (c) => {
    const query = parseListQuery(new URL(c.req.url).searchParams);
    const version = await new SyncRepository(c.env.DB).getVersion("tasks_version");
    const etag = `"${version}-${hashQuery(query)}"`;

    // Условный GET по RFC 7232: If-None-Match может быть списком и «*»,
    // а прокси/края ослабляют ETag (W/...) — нормализуем обе стороны.
    const ifNoneMatch = c.req.header("if-none-match");
    const notModified =
      ifNoneMatch !== undefined &&
      ifNoneMatch
        .split(",")
        .some((tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === etag);

    if (notModified) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const data = await buildService(c).list(query);
    c.header("ETag", etag);
    c.header("Cache-Control", "no-store");
    return c.json(data);
  });

  routes.get("/:id", async (c) => {
    return c.json(await buildService(c).get(c.req.param("id")));
  });

  routes.post(
    "/",
    requireAuth,
    async (c) => {
      const payload = await parseJsonBody(c);
      const actor = currentUser(c);
      if (!actor) throw new ValidationError("Требуется авторизация");
      const task = await buildService(c).create(parseCreateTask(payload), actor);
      return c.json(task, 201);
    },
  );

  routes.patch(
    "/:id",
    requireAuth,
    async (c) => {
      const payload = await parseJsonBody(c);
      const actor = currentUser(c);
      if (!actor) throw new ValidationError("Требуется авторизация");
      const task = await buildService(c).update(
        c.req.param("id"),
        parseUpdateTask(payload),
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
