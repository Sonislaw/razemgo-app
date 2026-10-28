import assert from 'node:assert/strict';
import test from 'node:test';
import { meetsTargets, percentile, safeErrorCode, summarizeSamples, validReadResult } from './load-results.mjs';

test('load percentiles use nearest rank, do not mutate input and preserve no samples', () => {
  const values = [100, 20, 60, 40];
  assert.equal(percentile(values, 0.5), 40);
  assert.equal(percentile(values, 0.95), 100);
  assert.equal(percentile([], 0.95), null);
  assert.deepEqual(values, [100, 20, 60, 40]);
});

test('load reporting includes timed-out reads and separates successful latency', () => {
  const summary = summarizeSamples([
    { ok: true, ms: 100, bytes: 80, status: 200, code: null },
    { ok: false, ms: 10000, bytes: 40, status: 504, code: 'PGRST003' },
    { ok: false, ms: 30000, bytes: 0, status: 0, code: 'CLIENT_TIMEOUT' },
  ]);
  assert.equal(summary.p95Ms, 30000);
  assert.equal(summary.successfulP95Ms, 100);
  assert.equal(summary.errorRate, 2 / 3);
  assert.equal(summary.responseBytes, 120);
  assert.equal(summary.successfulResponseBytes, 80);
  assert.deepEqual(summary.failureCodes, { PGRST003: 1, CLIENT_TIMEOUT: 1 });
  assert.equal(summarizeSamples([]).successfulP95Ms, null);
});

test('load gate evaluates each endpoint; fast failures and missing results cannot pass', () => {
  const row = (ranking, ms, ok = true) => ({
    ranking,
    metrics: summarizeSamples([{ ok, ms, bytes: 0, status: ok ? 200 : 500, code: ok ? null : '57014' }]),
  });
  assert.equal(meetsTargets([row(false, 800), row(true, 1500)]), true);
  assert.equal(meetsTargets([row(false, 801), row(true, 1)]), false);
  assert.equal(meetsTargets([row(false, 1, false)]), false);
  assert.equal(meetsTargets([]), false);
  assert.equal(meetsTargets([{ ranking: false, metrics: summarizeSamples([]) }]), false);
});

test('diagnostic codes discard free text and never include response details', () => {
  assert.equal(safeErrorCode('57014'), '57014');
  assert.equal(safeErrorCode('PGRST003'), 'PGRST003');
  for (const value of ['private@example.invalid', 'Bearer secret', 'select secret', null, { token: 'secret' }])
    assert.equal(safeErrorCode(value), 'HTTP_ERROR');
});

test('load fixtures must return real non-empty pages, not just HTTP 200', () => {
  const group = { crew: { id: '11111111-1111-4111-8111-111111111111' }, compatibility: { score: 70 } };
  const page = { items: Array(5).fill(group), total_count: 9999, has_more: true, cursor: {} };
  assert.equal(validReadResult('groups', page), true);
  assert.equal(validReadResult('trips', page), false);
  assert.equal(validReadResult('groups', { ...page, items: [] }), false);
  assert.equal(validReadResult('groups', { ...page, total_count: 2 }), false);
  assert.equal(validReadResult('groups', { ...page, cursor: undefined }), false);
  assert.equal(validReadResult('groups', { ...page, items: Array(5).fill({ crew: {}, compatibility: { score: 70 } }) }), false);
  assert.equal(validReadResult('mailbox', { conversations: [], invitations: [], pages: {} }), false);
  assert.equal(validReadResult('summary', { revision: 0, unread_messages: 0, pending_invitations: 0, unread_notifications: 0, active_trips: 5, archived_trips: 0 }), true);
  assert.equal(validReadResult('summary', { revision: 0 }), false);
});
