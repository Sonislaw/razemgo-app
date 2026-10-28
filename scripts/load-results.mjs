// Reports contain aggregates only. Never retain response bodies, credentials,
// SQL text, profile identifiers or exception messages from the HTTP transport.
export function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Math.round(ordered[Math.ceil(ordered.length * fraction) - 1]);
}

export function summarizeSamples(samples) {
  const successful = samples.filter((sample) => sample.ok);
  const failures = samples.filter((sample) => !sample.ok);
  const counts = (key) => {
    const result = {};
    for (const sample of failures) {
      const value = sample[key];
      result[value] = (result[value] ?? 0) + 1;
    }
    return result;
  };
  return {
    attempts: samples.length,
    successful: successful.length,
    failed: failures.length,
    errorRate: samples.length ? failures.length / samples.length : 0,
    // Includes timeouts and HTTP errors. A fast error is never a successful read.
    p50Ms: percentile(samples.map((sample) => sample.ms), 0.5),
    p95Ms: percentile(samples.map((sample) => sample.ms), 0.95),
    maxMs: percentile(samples.map((sample) => sample.ms), 1),
    successfulP95Ms: percentile(successful.map((sample) => sample.ms), 0.95),
    responseBytes: samples.reduce((sum, sample) => sum + sample.bytes, 0),
    successfulResponseBytes: successful.reduce((sum, sample) => sum + sample.bytes, 0),
    failureStatuses: counts('status'),
    failureCodes: counts('code'),
  };
}

export function meetsTargets(operations) {
  return operations.length > 0 && operations.every(
    ({ ranking, metrics }) =>
      metrics.attempts > 0 &&
      metrics.errorRate < 0.01 &&
      metrics.p95Ms !== null &&
      metrics.p95Ms <= (ranking ? 1500 : 800),
  );
}

export function safeErrorCode(value) {
  // PostgreSQL SQLSTATE and PostgREST codes only; all free text is discarded.
  return typeof value === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(value)
    ? value
    : 'HTTP_ERROR';
}

export function validReadResult(kind, value) {
  if (!value || typeof value !== 'object') return false;
  if (kind === 'summary')
    return [
      'revision', 'unread_messages', 'pending_invitations',
      'unread_notifications', 'active_trips', 'archived_trips',
    ].every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
  if (kind === 'mailbox')
    return Array.isArray(value.conversations) && value.conversations.length > 0 &&
      Array.isArray(value.invitations) && value.invitations.length > 0 &&
      !!value.pages && typeof value.pages === 'object';
  return Array.isArray(value.items) && value.items.length === 5 &&
    Number.isSafeInteger(value.total_count) && value.total_count >= 9999 &&
    value.has_more === true && value.cursor !== null &&
    value.items.every((item) =>
      !!item.crew && (kind === 'groups' || !!item.trip) &&
      Number.isFinite(item.compatibility?.score),
    );
}
