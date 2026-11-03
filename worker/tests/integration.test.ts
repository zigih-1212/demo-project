/**
 * Интеграционные тесты: реальный Worker (esbuild-bundle) на Miniflare с
 * D1 (in-memory), KV и stub'ом очереди.
 *
 * Здесь проверяется то, что unit-тесты не покрывают: routing, middleware
 * (CORS, rate limit, auth), условные GET/ETag, ownership, регистрация и
 * consumer очереди. Прогон миграций — на чистой БД, как в CI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { processBatch } from "../src/queue/consumer";
import type { Env, TaskJob } from "../src/types";

// vitest запускается из worker/, поэтому cwd надёжно указывает на пакет.
const here = path.join(process.cwd(), "tests");
const bundleDir = path.join(here, ".bundle");

let mf: Miniflare;

beforeAll(async () => {
  fs.mkdirSync(bundleDir, { recursive: true });

  // Точка входа — tests/worker-entry.ts: реальный воркер + stub QUEUE binding.
  await build({
    entryPoints: [path.join(here, "worker-entry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    outfile: path.join(bundleDir, "worker.js"),
    logLevel: "silent",
  });

  mf = new Miniflare({
    modules: true,
    scriptPath: path.join(bundleDir, "worker.js"),
    d1Databases: { DB: ":memory:" },
    kvNamespaces: { CACHE: "test-cache" },
    // miniflare НЕ читает wrangler.toml: текстовые переменные — через
    // bindings (Record<string, Json>). QUEUE подменён в worker-entry.ts.
    bindings: {
      ENVIRONMENT: "test",
      LOG_LEVEL: "error",
      JWT_SECRET: "integration-test-secret",
      // Зеркалим продакшн-allowlist: CORS-тесты используют pages.dev origin.
      FRONTEND_ORIGIN:
        "https://master.demo-fullstack-frontend.pages.dev,http://localhost:5173",
    },
    compatibilityFlags: ["nodejs_compat"],
  });

  const db = await mf.getD1Database("DB");
  for (const file of ["0001_init.sql", "0002_metrics.sql", "0003_auth.sql", "0004_sync.sql"]) {
    // Miniflare D1 (libsql): exec() выполняет одно выражение, PRAGMA не
    // поддерживается. На реальном D1 миграции применяются wrangler'ом целиком.
    // В тестовой схеме FK-ограничений нет, поэтому PRAGMA безопасно выкинуть.
    const sql = fs
      .readFileSync(path.join(here, "..", "migrations", file), "utf8")
      .replace(/PRAGMA\s+foreign_keys\s*=\s*ON\s*;/gi, "");
    // Симулятор D1 в miniflare не выполняет многострочные выражения
    // (exec падает с "incomplete input", prepare — с "did not contain a
    // statement"). Нормализуем каждое выражение в одну строку. На реальном
    // D1 миграции применяет wrangler d1 migrations apply целым файлом.
    for (const raw of sql.split(";")) {
      // Сначала убираем `--`-комментарии (минус: exec симулятора считает
      // выражение, начинающееся с комментария, пустым), потом склеиваем
      // в одну строку (exec симулятора не выполняет многострочные выражения).
      const stmt = raw
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (stmt) await db.exec(stmt + ";");
    }
  }
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

const JSON_HEADERS = { "Content-Type": "application/json" };
const ip = (id: string) => ({ "cf-connecting-ip": id });

// Miniflare v3 (2026): публичный mf.fetch() убран, dispatchFetch() требует
// абсолютный URL. Обёртка — чтобы тесты писались с относительными путями.
const ORIGIN = "http://localhost";
function mfFetch(pathname: string, init?: RequestInit) {
  return mf.dispatchFetch(
    ORIGIN + pathname,
    init as Parameters<typeof mf.dispatchFetch>[1],
  );
}

async function call(pathname: string, init?: RequestInit) {
  const res = await mfFetch(pathname, init);
  let body: any = null;
  try {
    body = JSON.parse(await res.text());
  } catch {
    /* не JSON */
  }
  return { status: res.status, headers: res.headers, body };
}

async function login(email: string, password: string, ipId: string) {
  const { status, body } = await call("/api/v1/auth/login", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...ip(ipId) },
    body: JSON.stringify({ email, password }),
  });
  expect(status).toBe(200);
  return body.token as string;
}

describe("integration: health, CORS, метрики", () => {
  it("GET /health — ok с БД и статусом кэша", async () => {
    const { status, body } = await call("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(["ok", "degraded"]).toContain(body.cache);
  });

  it("OPTIONS preflight: разрешённый origin получает ACAO", async () => {
    const res = await mfFetch("/api/v1/auth/login", {
      method: "OPTIONS",
      headers: { Origin: "https://master.demo-fullstack-frontend.pages.dev", "Access-Control-Request-Method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://master.demo-fullstack-frontend.pages.dev",
    );
  });

  it("OPTIONS preflight: чужой origin не получает ACAO", async () => {
    const res = await mfFetch("/api/v1/auth/login", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("ответ содержит X-Request-Id", async () => {
    const { headers } = await call("/health");
    expect(headers.get("x-request-id")).toBeTruthy();
  });

  it("GET /metrics отдаёт Prometheus-текст", async () => {
    const res = await mfFetch("/metrics");
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("http_requests_total");
  });
});

describe("integration: auth", () => {
  it("логин demo-admin возвращает токен и роль admin", async () => {
    const { status, body } = await call("/api/v1/auth/login", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-login") },
      body: JSON.stringify({ email: "admin@pulse.dev", password: "demo1234" }),
    });
    expect(status).toBe(200);
    expect(body.user.role).toBe("admin");
    expect(body.token).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });

  it("неверный пароль — 401 с кодом unauthorized", async () => {
    const { status, body } = await call("/api/v1/auth/login", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-login-bad") },
      body: JSON.stringify({ email: "admin@pulse.dev", password: "wrongpassword" }),
    });
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });

  it("массив вместо объекта в теле — 400 (баг-регрессия)", async () => {
    const { status, body } = await call("/api/v1/auth/login", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-login-array") },
      body: JSON.stringify(["admin@pulse.dev", "demo1234"]),
    });
    expect(status).toBe(400);
    expect(body.error.message).toContain("объект");
  });

  it("GET на POST-only маршрут /login — 404 (Hono: несовпадение метода = notFound)", async () => {
    const { status } = await call("/api/v1/auth/login");
    // Hono не генерирует 405 автоматически: путь + метод не совпали —
    // срабатывает notFound. REST-корректнее 405, но это поведение фреймворка,
    // кастомный Allow-обработчик непропорционален демо.
    expect(status).toBe(404);
  });

  it("регистрация нового пользователя и вход", async () => {
    const reg = await call("/api/v1/auth/register", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-reg") },
      body: JSON.stringify({ email: "integration@pulse.dev", name: "Интеграционный", password: "strongpass123" }),
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe("member");

    const dup = await call("/api/v1/auth/register", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-reg") },
      body: JSON.stringify({ email: "integration@pulse.dev", name: "Повтор", password: "strongpass123" }),
    });
    expect(dup.status).toBe(409);

    const weak = await call("/api/v1/auth/register", {
      method: "POST",
      headers: { ...JSON_HEADERS, ...ip("ip-reg") },
      body: JSON.stringify({ email: "weak@pulse.dev", name: "Слабый", password: "123" }),
    });
    expect(weak.status).toBe(400);
  });

  it("/me с токеном — пользователь; без токена — 401", async () => {
    const token = await login("anna@pulse.dev", "demo1234", "ip-me");
    const withToken = await call("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}`, ...ip("ip-me") },
    });
    expect(withToken.status).toBe(200);
    expect(withToken.body.user.email).toBe("anna@pulse.dev");

    const noToken = await call("/api/v1/auth/me");
    expect(noToken.status).toBe(401);
  });
});

describe("integration: задачи, владение, валидация", () => {
  it("список задач публичен, пагинация и фильтры", async () => {
    const { status, body } = await call("/api/v1/tasks?page=1&pageSize=5&status=todo", {
      headers: ip("ip-list"),
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body.pageSize).toBe(5);
  });

  it("невалидный sort — 400", async () => {
    const { status } = await call("/api/v1/tasks?sort=nonexistent", { headers: ip("ip-list-bad") });
    expect(status).toBe(400);
  });

  it("CRUD с владением: member не может менять чужую задачу (403)", async () => {
    const anna = await login("anna@pulse.dev", "demo1234", "ip-crud-anna");
    const dmitry = await login("dmitry@pulse.dev", "demo1234", "ip-crud-dmitry");
    const admin = await login("admin@pulse.dev", "demo1234", "ip-crud-admin");

    // Анна создаёт задачу без исполнителя
    const created = await call("/api/v1/tasks", {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${anna}`, ...ip("ip-crud-anna") },
      body: JSON.stringify({ title: "Задача Анны", description: "тест владения", priority: "high" }),
    });
    expect(created.status).toBe(201);
    const taskId = created.body.id;
    expect(created.body.createdBy).toBe("u-anna");

    // Дмитрий (member, не создатель и не исполнитель) — 403
    const foreign = await call(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${dmitry}`, ...ip("ip-crud-dmitry") },
      body: JSON.stringify({ status: "done" }),
    });
    expect(foreign.status).toBe(403);

    // Анна (создатель) — ok
    const own = await call(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${anna}`, ...ip("ip-crud-anna") },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(own.status).toBe(200);
    expect(own.body.status).toBe("in_progress");

    // Админ — ok (override)
    const byAdmin = await call(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${admin}`, ...ip("ip-crud-admin") },
      body: JSON.stringify({ status: "done" }),
    });
    expect(byAdmin.status).toBe(200);

    // Без токена мутация — 401
    const noAuth = await call(`/api/v1/tasks/${taskId}`, {
      method: "DELETE",
      headers: ip("ip-crud-anna"),
    });
    expect(noAuth.status).toBe(401);

    // Удаление — создатель
    const del = await call(`/api/v1/tasks/${taskId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${anna}`, ...ip("ip-crud-anna") },
    });
    expect(del.status).toBe(200);

    // После удаления — 404
    const gone = await call(`/api/v1/tasks/${taskId}`, { headers: ip("ip-crud-anna") });
    expect(gone.status).toBe(404);
  });

  it("создание с коротким title — 400", async () => {
    const admin = await login("admin@pulse.dev", "demo1234", "ip-validate");
    const { status, body } = await call("/api/v1/tasks", {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${admin}`, ...ip("ip-validate") },
      body: JSON.stringify({ title: "ab" }),
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });
});

describe("integration: синхронизация (версия + ETag)", () => {
  it("ETag стабилен для неизменённых данных → 304", async () => {
    const token = await login("admin@pulse.dev", "demo1234", "ip-etag");
    const first = await call("/api/v1/tasks", { headers: { Authorization: `Bearer ${token}`, ...ip("ip-etag") } });
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toBeTruthy();

    const second = await call("/api/v1/tasks", {
      headers: { Authorization: `Bearer ${token}`, "If-None-Match": etag, ...ip("ip-etag") },
    });
    expect(second.status).toBe(304);
  });

  it("мутация инкрементирует tasks_version → старый ETag даёт 200", async () => {
    const token = await login("admin@pulse.dev", "demo1234", "ip-version");
    const before = await call("/api/v1/sync/version", { headers: { ...ip("ip-version") } });
    const versionBefore = before.body.version;

    const created = await call("/api/v1/tasks", {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, ...ip("ip-version") },
      body: JSON.stringify({ title: "Задача для bump версии" }),
    });
    expect(created.status).toBe(201);

    const after = await call("/api/v1/sync/version", { headers: { ...ip("ip-version") } });
    expect(after.body.version).toBeGreaterThan(versionBefore);

    // старый ETag больше не валиден
    const stale = await call("/api/v1/tasks", {
      headers: { Authorization: `Bearer ${token}`, "If-None-Match": `"${versionBefore}-0"`, ...ip("ip-version") },
    });
    expect(stale.status).toBe(200);

    // cleanup
    await call(`/api/v1/tasks/${created.body.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, ...ip("ip-version") },
    });
  });
});

describe("integration: rate limit", () => {
  it("11+ быстрых POST /login с одного IP → 429 с Retry-After", async () => {
    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await mfFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { ...JSON_HEADERS, ...ip("ip-rl-burst") },
        body: JSON.stringify({ email: "nope@pulse.dev", password: "whatever1" }),
      });
      if (res.status === 429) {
        limited = true;
        expect(res.headers.get("retry-after")).toBeTruthy();
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("заголовки X-RateLimit-* присутствуют на чтении", async () => {
    const { headers } = await call("/api/v1/tasks", { headers: ip("ip-rl-headers") });
    expect(headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(headers.get("x-ratelimit-remaining")).toBeTruthy();
    expect(headers.get("x-ratelimit-class")).toBe("read");
  });
});

describe("integration: analytics, activity, audit", () => {
  it("summary возвращает агрегаты", async () => {
    const { status, body } = await call("/api/v1/analytics/summary", { headers: ip("ip-analytics") });
    expect(status).toBe(200);
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("byStatus");
    expect(body).toHaveProperty("completionRate");
  });

  it("activity требует авторизации", async () => {
    const noAuth = await call("/api/v1/activity", { headers: ip("ip-activity") });
    expect(noAuth.status).toBe(401);

    const token = await login("admin@pulse.dev", "demo1234", "ip-activity-admin");
    const ok = await call("/api/v1/activity", { headers: { Authorization: `Bearer ${token}`, ...ip("ip-activity-admin") } });
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.items)).toBe(true);
  });

  it("POST /audit возвращает отчёт и ставит в очередь", async () => {
    const token = await login("admin@pulse.dev", "demo1234", "ip-audit");
    const { status, body } = await call("/api/v1/analytics/audit", {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, ...ip("ip-audit") },
    });
    expect(status).toBe(200);
    expect(body.checksRun).toBeGreaterThan(0);
    expect(Array.isArray(body.findings)).toBe(true);
  });
});

describe("integration: queue consumer", () => {
  function fakeBatch(jobs: TaskJob[]): MessageBatch<TaskJob> {
    return {
      messages: jobs.map((body) => ({
        body,
        ack: () => {},
        retry: () => {},
        id: "msg-" + Math.random(),
        timestamp: Date.now(),
      })),
    } as unknown as MessageBatch<TaskJob>;
  }

  // Miniflare-типы D1/KV структурно несовместимы с workers-types —
  // приведение через unknown (тестовая среда, рантайм один и тот же).
  function env(db: unknown, kv: unknown): Env {
    return {
      DB: db as D1Database,
      CACHE: kv as KVNamespace,
      QUEUE: { send: async () => ({}), sendBatch: async () => [] } as unknown as Queue<TaskJob>,
      ENVIRONMENT: "test",
      LOG_LEVEL: "error",
      JWT_SECRET: "test-secret",
      FRONTEND_ORIGIN: "http://localhost:5173",
    };
  }

  it("audit.run персистит отчёт в audit_runs", async () => {
    const db = await mf.getD1Database("DB");
    const kv = await mf.getKVNamespace("CACHE");
    const before = (await db.prepare("SELECT COUNT(*) AS c FROM audit_runs").first<{ c: number }>())?.c ?? 0;

    await processBatch(
      fakeBatch([{ type: "audit.run", requestedAt: new Date().toISOString() }]),
      env(db, kv),
    );

    const after = (await db.prepare("SELECT COUNT(*) AS c FROM audit_runs").first<{ c: number }>())?.c ?? 0;
    expect(after).toBe(before + 1);
  });

  it("task.reindex инвалидирует версию кэша списка", async () => {
    const db = await mf.getD1Database("DB");
    const kv = await mf.getKVNamespace("CACHE");
    const before = Number.parseInt((await kv.get("cachever:tasks:list")) ?? "0", 10) || 0;

    await processBatch(
      fakeBatch([{ type: "task.reindex", taskId: "t-001", requestedAt: new Date().toISOString() }]),
      env(db, kv),
    );

    const after = Number.parseInt((await kv.get("cachever:tasks:list")) ?? "0", 10) || 0;
    expect(after).toBeGreaterThan(before);
  });
});
