import type { AuditFinding } from "../types";

export interface AuditReport {
  findings: AuditFinding[];
  score: number;
  summary: string;
  refactoringPlan: Array<{ step: number; action: string; rationale: string; effort: "S" | "M" | "L" }>;
  checksRun: number;
  generatedAt: string;
}

interface IndexRow {
  name: string;
  tbl_name: string;
  sql: string | null;
}

interface TableRow {
  name: string;
}

const REQUIRED_INDEXES = [
  { name: "idx_tasks_status_created", table: "tasks", columns: ["status", "created_at"], reason: "Фильтр по статусу + сортировка по дате — основной паттерн списка" },
  { name: "idx_tasks_priority", table: "tasks", columns: ["priority"], reason: "Фильтр по приоритету" },
  { name: "idx_tasks_assignee", table: "tasks", columns: ["assignee"], reason: "Агрегация по исполнителям" },
];

const STALE_IN_PROGRESS_DAYS = 7;

export class AuditService {
  constructor(private readonly db: D1Database) {}

  async run(): Promise<AuditReport> {
    const findings: AuditFinding[] = [];
    let checksRun = 0;

    const indexes = await this.listIndexes();
    const tables = await this.listTables();
    checksRun += 2;

    for (const required of REQUIRED_INDEXES) {
      const exists = indexes.find((index) => index.name === required.name);
      if (!exists) {
        findings.push({
          severity: "warning",
          category: "performance",
          message: "Отсутствует индекс " + required.name + " (" + required.columns.join(", ") + ")",
          location: required.table,
        });
      }
    }

    for (const table of tables) {
      const tableIndexes = indexes.filter((index) => index.tbl_name === table.name);
      if (tableIndexes.length === 0) {
        findings.push({
          severity: "critical",
          category: "performance",
          message: "Таблица " + table.name + " не имеет ни одного индекса — любой фильтр приведёт к full scan",
          location: table.name,
        });
      }
    }
    checksRun += tables.length;

    const unassigned = await this.countWhere("assignee = 'unassigned'");
    checksRun += 1;
    if (unassigned > 0) {
      findings.push({
        severity: unassigned > 5 ? "warning" : "info",
        category: "data_quality",
        message: unassigned + " задач без исполнителя",
        location: "tasks.assignee",
      });
    }

    const stale = await this.countStale();
    checksRun += 1;
    if (stale > 0) {
      findings.push({
        severity: "warning",
        category: "process",
        message: stale + " задач в статусе in_progress без изменений более " + STALE_IN_PROGRESS_DAYS + " дней",
        location: "tasks.status",
      });
    }

    const blockedCritical = await this.countWhere("status = 'blocked' AND priority = 'critical'");
    checksRun += 1;
    if (blockedCritical > 0) {
      findings.push({
        severity: "critical",
        category: "process",
        message: blockedCritical + " критических задач заблокированы",
        location: "tasks",
      });
    }

    const emptyDescriptions = await this.countWhere("(description IS NULL OR description = '') AND priority = 'critical'");
    checksRun += 1;
    if (emptyDescriptions > 0) {
      findings.push({
        severity: "info",
        category: "data_quality",
        message: emptyDescriptions + " критических задач без описания",
        location: "tasks.description",
      });
    }

    const score = calculateScore(findings);
    const plan = buildPlan(findings);

    return {
      findings,
      score,
      summary: buildSummary(findings, score),
      refactoringPlan: plan,
      checksRun,
      generatedAt: new Date().toISOString(),
    };
  }

  private async listIndexes(): Promise<IndexRow[]> {
    const rows = await this.db
      .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'")
      .all<IndexRow>();
    return rows.results ?? [];
  }

  private async listTables(): Promise<TableRow[]> {
    const rows = await this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
      .all<TableRow>();
    return rows.results ?? [];
  }

  private async countWhere(where: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS total FROM tasks WHERE " + where)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  private async countStale(): Promise<number> {
    const threshold = new Date(Date.now() - STALE_IN_PROGRESS_DAYS * 86400000).toISOString();
    const row = await this.db
      .prepare("SELECT COUNT(*) AS total FROM tasks WHERE status = 'in_progress' AND updated_at < ?")
      .bind(threshold)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }
}

function calculateScore(findings: AuditFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "critical") return total + 12;
    if (finding.severity === "warning") return total + 5;
    return total + 1;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function buildSummary(findings: AuditFinding[], score: number): string {
  if (findings.length === 0) return "Замечаний не найдено, схема в консистентном состоянии";
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  return (
    "Проведено " + findings.length + " замечаний: критических " + critical +
    ", предупреждений " + warning + ". Оценка качества: " + score + "/100"
  );
}

function buildPlan(findings: AuditFinding[]): AuditReport["refactoringPlan"] {
  const plan: AuditReport["refactoringPlan"] = [];
  let step = 1;

  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  for (const finding of critical) {
    plan.push({
      step: step++,
      action: "Устранить: " + finding.message,
      rationale: "Критичное замечание блокирует использование данных в production",
      effort: finding.category === "performance" ? "M" : "S",
    });
  }
  for (const finding of warnings) {
    plan.push({
      step: step++,
      action: "Исправить: " + finding.message,
      rationale: "Снижает производительность запросов или прозрачность процесса",
      effort: "M",
    });
  }
  for (const finding of infos) {
    plan.push({
      step: step++,
      action: "Улучшить: " + finding.message,
      rationale: "Повышает качество данных и снижает ручную работу",
      effort: "S",
    });
  }

  return plan;
}