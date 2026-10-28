// Bounded aggregate diagnostics. Never retain URLs, headers, identifiers or bodies.
type Metric = {
  requests: number;
  responseBytes: number;
  failures: number;
  totalMs: number;
};
const totals = new Map<string, Metric>();
let enabled = false;
export function setRequestMetricsEnabled(value: boolean) {
  enabled = value;
  if (!value) totals.clear();
}
export function requestMetricsEnabled() {
  return enabled;
}
export function recordRequestMetric(
  operation: string,
  ms: number,
  bytes: number,
  failed: boolean,
) {
  if (!enabled) return;
  const previous = totals.get(operation) ?? {
    requests: 0,
    responseBytes: 0,
    failures: 0,
    totalMs: 0,
  };
  totals.set(operation, {
    requests: previous.requests + 1,
    responseBytes: previous.responseBytes + bytes,
    failures: previous.failures + Number(failed),
    totalMs: previous.totalMs + ms,
  });
}
export function requestMetrics() {
  return Object.fromEntries(
    [...totals].map(([key, value]) => [key, { ...value }]),
  );
}
export function resetRequestMetrics() {
  totals.clear();
}
