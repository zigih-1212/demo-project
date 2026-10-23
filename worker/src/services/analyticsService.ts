import { CacheService } from "../lib/cache";
import { TaskRepository } from "../repositories/taskRepository";
import type { TaskPriority, TaskStatus } from "../types";

export interface DashboardSummary {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  createdPerDay: Array<{ date: string; count: number }>;
  topAssignees: Array<{ assignee: string; count: number }>;
  completionRate: number;
  generatedAt: string;
}

const STATS_TTL = 60;

export class AnalyticsService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly cache: CacheService,
  ) {}

  async summary(days = 14): Promise<DashboardSummary> {
    const cached = await this.cache.getVersioned<DashboardSummary>("tasks:stats", "summary");
    if (cached) return cached;

    const [total, byStatus, byPriority, createdPerDay, topAssignees] = await Promise.all([
      this.repository.countAll(),
      this.repository.statsByStatus(),
      this.repository.statsByPriority(),
      this.repository.createdPerDay(days),
      this.repository.topAssignees(5),
    ]);

    const done = byStatus.done ?? 0;
    const summary: DashboardSummary = {
      total,
      byStatus,
      byPriority,
      createdPerDay,
      topAssignees,
      completionRate: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
      generatedAt: new Date().toISOString(),
    };

    await this.cache.setVersioned("tasks:stats", "summary", summary, { ttlSeconds: STATS_TTL, prefix: "tasks:stats" });
    return summary;
  }
}