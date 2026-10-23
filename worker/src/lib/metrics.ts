interface Bucket { le: number; count: number }

interface Histogram {
  name: string;
  help: string;
  buckets: Bucket[];
  sum: number;
  count: number;
}

const registry = {
  counters: new Map<string, { name: string; help: string; labels: Record<string, string>; value: number }>(),
  histograms: new Map<string, Histogram & { labels: Record<string, string> }>(),
  gauges: new Map<string, { name: string; help: string; labels: Record<string, string>; value: number }>(),
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
  const parts = keys.map((k) => k + '="' + String(labels[k]).split(String.fromCharCode(34)).join("'") + '"');
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

export function renderPrometheus(): string {
  const lines: string[] = [];

  for (const counter of registry.counters.values()) {
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

export function resetMetrics(): void {
  registry.counters.clear();
  registry.histograms.clear();
  registry.gauges.clear();
}