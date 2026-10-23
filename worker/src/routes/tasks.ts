import { Hono } from "hono";
import { CacheService } from "../lib/cache";
import { NotFoundError, ValidationError } from "../lib/errors";
import { TaskRepository } from "../repositories/taskRepository";
import { TaskService } from "../services/taskService";
import { parseCreateTask, parseListQuery, parseUpdateTask } from "../lib/validate";
import type { Env } from "../types";

function buildService(env: Env): TaskService {
  return new TaskService(new TaskRepository(env.DB), new CacheService(env.CACHE), env.QUEUE);
}

export function taskRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/", async (c) => {
    const query = parseListQuery(new URL(c.req.url).searchParams);
    return c.json(await buildService(c.env).list(query));
  });

  routes.get("/:id", async (c) => {
    return c.json(await buildService(c.env).get(c.req.param("id")));
  });

  routes.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("Request body must be valid JSON");
    }
    const task = await buildService(c.env).create(parseCreateTask(body));
    return c.json(task, 201);
  });

  routes.patch("/:id", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("Request body must be valid JSON");
    }
    const repository = new TaskRepository(c.env.DB);
    const current = await repository.findById(c.req.param("id"));
    if (!current) throw new NotFoundError("Task");
    const task = await buildService(c.env).update(current.id, parseUpdateTask(body, current));
    return c.json(task);
  });

  routes.delete("/:id", async (c) => {
    await buildService(c.env).remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  return routes;
}