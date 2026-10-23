export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: number = LEVELS.info;

/**
 * Уровень логирования задаётся из переменных окружения воркера.
 *
 * В Workers нет глобального process.env, поэтому уровень хранится
 * в модуле и выставляется при старте.
 */
export function configureLogger(level: string | undefined): void {
  if (!level) return;
  const resolved = LEVELS[level as LogLevel];
  if (resolved !== undefined) minLevel = resolved;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= minLevel;
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}