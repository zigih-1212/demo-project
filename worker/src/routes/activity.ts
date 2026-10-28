import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { ActivityRepository } from "../repositories/activityRepository";
import type { Env } from "../types";

export function activityRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/", requireAuth, async (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "12", 10);
    const items = await new ActivityRepository(c.env.DB).recent(
      Number.isNaN(limit) ? 12 : limit,
    );
    return c.json({ items });
  });

  return routes;
}
