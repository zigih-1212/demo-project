import { beforeEach, describe, expect, it } from "vitest";
import { increment, observe, renderPrometheus, resetMetrics, setGauge } from "../src/lib/metrics";

describe("metrics registry", () => {
  beforeEach(() => resetMetrics());

  it("рендерит счётчик в формате Prometheus", () => {
    increment("tasks_created_total", { priority: "high" });
    const output = renderPrometheus();
    expect(output).toContain("tasks_created_total");
    expect(output).toContain("priority=\"high\"");
  });

  it("суммирует одинаковые метрики", () => {
    increment("requests_total", { route: "/api" });
    increment("requests_total", { route: "/api" });
    expect(renderPrometheus()).toContain("requests_total{route=\"/api\"} 2");
  });

  it("рендерит гистограмму с bucket'ами", () => {
    observe("latency_seconds", 0.02);
    const output = renderPrometheus();
    expect(output).toContain("latency_seconds_bucket");
    expect(output).toContain("latency_seconds_count 1");
  });

  it("поддерживает gauge", () => {
    setGauge("db_latency_ms", 42);
    expect(renderPrometheus()).toContain("db_latency_ms 42");
  });
});