interface Bucket { le: number; count: number }

interface Histogram {
  name: string;
  help: string;
  buckets: Bucket[];
  sum: number;
  count: number;
}

interface CounterEntry {
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

const registry = {
  counters: new Map<string, CounterEntry>(),
  histograms: new Map<string, Histogram & { labels: Record<string, string> }>(),
  gauges: new Map<string, CounterEntry>(),
};

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labelKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => k + "=" + labels[k]).join(",");
}

function renderLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const quote = String.fromCharCode(34);
  const parts = keys.map((k) => {
    const value = String(labels[k]).split(quote).join("'");
    return k + "=" + quote + value + quote;
  });
  return "{" + parts.join(",") + "}";
}

export function increment(name: string, labels: Record<string, string> = {}, delta = 1): void {
  const key = name + "|" + labelKey(labels);
  const existing = registry.counters.get(key);
  if (existing) existing.value += delta;
  else registry.counters.set(key, { name, help: name, labels, value: delta });
}

export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  const key = name + "|" + labelKey(labels);
  registry.gauges.set(key, { name, help: name, labels, value });
}

export function observe(name: string, seconds: number, labels: Record<string, string> = {}): void {
  const key = name + "|" + labelKey(labels);
  let histogram = registry.histograms.get(key);
  if (!histogram) {
    histogram = {
      name,
      help: name,
      labels,
      buckets: DEFAULT_BUCKETS.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    };
    registry.histograms.set(key, histogram);
  }
  histogram.sum += seconds;
  histogram.count += 1;
  for (const bucket of histogram.buckets) {
    if (seconds <= bucket.le) bucket.count += 1;
  }
}

/**
 * Забирает накопленные дельты счётчиков и обнуляет их.
 *
 * Дельты уходят в D1, поэтому в памяти они больше не нужны: иначе
 * значение посчиталось бы дважды.
 */
export function drainCounters(): CounterEntry[] {
  const drained = Array.from(registry.counters.values());
  registry.counters.clear();
  return drained;
}

export interface PersistedCounter {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export function renderPrometheus(persisted: PersistedCounter[] = []): string {
  const lines: string[] = [];
  const merged = new Map<string, CounterEntry>();

  for (const entry of persisted) {
    const key = entry.name + "|" + labelKey(entry.labels);
    merged.set(key, { name: entry.name, help: entry.name, labels: entry.labels, value: entry.value });
  }

  for (const entry of registry.counters.values()) {
    const key = entry.name + "|" + labelKey(entry.labels);
    const existing = merged.get(key);
    if (existing) existing.value += entry.value;
    else merged.set(key, { ...entry });
  }

  for (const counter of merged.values()) {
    lines.push("# HELP " + counter.name + " " + counter.help);
    lines.push("# TYPE " + counter.name + " counter");
    lines.push(counter.name + renderLabels(counter.labels) + " " + counter.value);
  }

  for (const gauge of registry.gauges.values()) {
    lines.push("# HELP " + gauge.name + " " + gauge.help);
    lines.push("# TYPE " + gauge.name + " gauge");
    lines.push(gauge.name + renderLabels(gauge.labels) + " " + gauge.value);
  }

  for (const histogram of registry.histograms.values()) {
    lines.push("# HELP " + histogram.name + " " + histogram.help);
    lines.push("# TYPE " + histogram.name + " histogram");
    for (const bucket of histogram.buckets) {
      lines.push(
        histogram.name + "_bucket" + renderLabels({ ...histogram.labels, le: String(bucket.le) }) +
        " " + bucket.count,
      );
    }
    lines.push(histogram.name + "_sum" + renderLabels(histogram.labels) + " " + histogram.sum);
    lines.push(histogram.name + "_count" + renderLabels(histogram.labels) + " " + histogram.count);
  }

  return lines.join("\n") + "\n";
}

/**
 * Возвращает дельты в регистр после неудачной записи.
 *
 * Иначе потерянные метрики навсегда исчезли бы из наблюдаемости.
 */
export function restoreCounters(entries: CounterEntry[]): void {
  for (const entry of entries) {
    const key = entry.name + "|" + labelKey(entry.labels);
    const existing = registry.counters.get(key);
    if (existing) existing.value += entry.value;
    else registry.counters.set(key, { ...entry });
  }
}

export function resetMetrics(): void {
  registry.counters.clear();
  registry.histograms.clear();
  registry.gauges.clear();
}