import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { makeSessionSchedule, runSessionSchedule, sessionDefaults } from './session-load.mjs';
import { databaseMetrics, dockerUsage, poolMetrics, summarizeResources } from './load-resources.mjs';
import { readLoadPage, loadOperations } from './load-protocol.mjs';

const ok = () => ({ ok: true, ms: 1, bytes: 10, status: 200, code: null });
const small = { sessions: 40, rampMs: 100, steadyMs: 2000, syncMs: 100,
  actionMinMs: 50, actionMaxMs: 100, minimumSamples: 1 };
const fakeClock = () => {
  let elapsed = 0;
  return { now: () => elapsed, sleep: async ms => { elapsed += ms; await new Promise(resolve => setImmediate(resolve)); } };
};

test('paced workload is reproducible, bounded and independent of response times', () => {
  const a = makeSessionSchedule(), b = makeSessionSchedule();
  assert.deepEqual(a, b);
  assert.equal(a.settings.sessions, 200);
  assert.equal(a.endMs, 240000);
  assert.equal(a.events[0].atMs, 0);
  for (let i = 0; i < a.events.length; i++) {
    const event = a.events[i];
    assert.ok(event.atMs < a.endMs);
    assert.ok(event.session < 200);
    assert.equal(event.phase, event.atMs < 60000 ? 'ramp' : 'steady');
    if (i) assert.ok(a.events[i - 1].atMs <= event.atMs);
  }
  for (const operation of loadOperations) {
    assert.ok(a.events.filter(e => e.phase === 'steady' && e.id === operation.id).length >= sessionDefaults.minimumSamples);
  }
  assert.notDeepEqual(makeSessionSchedule({ randomSeed: 42 }).events, a.events);
});

test('unsafe or unbounded schedules fail before doing work', () => {
  for (const options of [{ sessions: 201 }, { sessions: 0 }, { rampMs: -1 }, { steadyMs: Infinity },
    { steadyMs: 3600001 }, { actionMinMs: 30000, actionMaxMs: 10000 }, { randomSeed: -1 },
    { randomSeed: 0.5 }, { syncMs: 1 }, { maxInFlightPerSession: 0 }]) {
    assert.throws(() => makeSessionSchedule(options));
  }
});

test('steady metrics exclude ramp samples, retain endpoint counts and require enough samples', async () => {
  const schedule = makeSessionSchedule(small), progress = [];
  const result = await runSessionSchedule(schedule, async () => ok(), { ...fakeClock(), onProgress: row => progress.push(row), progressMs: 200 });
  assert.equal(result.targetsMet, true);
  assert.equal(result.drainMs, 0);
  assert.equal(result.durationMs, schedule.endMs);
  for (const phase of ['ramp', 'steady']) {
    const planned = schedule.events.filter(event => event.phase === phase).length;
    assert.equal(result[phase].metrics.attempts, planned);
    assert.ok(result[phase].operations.every(row => row.missed === 0));
  }
  assert.equal(progress.at(-1).inFlight, 0);
  const tooFew = await runSessionSchedule(makeSessionSchedule({ ...small, minimumSamples: 100000 }), async () => ok(), fakeClock());
  assert.equal(tooFew.targetsMet, false);
});

test('slow reads cannot make the gate pass by reducing traffic or overlapping the same read', async () => {
  const schedule = makeSessionSchedule({ ...small, sessions: 1, maxInFlightPerSession: 2 });
  const clock = fakeClock(), pending = [], active = new Set();
  let peak = 0;
  const result = await runSessionSchedule(schedule, async (session, id) => {
    assert.ok(!active.has(id)); active.add(id); peak = Math.max(peak, active.size);
    await new Promise(resolve => pending.push(resolve));
    active.delete(id); return ok();
  }, { ...clock, sleep: async ms => {
    await clock.sleep(ms);
    if (clock.now() >= schedule.endMs) for (const resolve of pending.splice(0)) resolve();
  } });
  assert.ok(peak <= 2);
  assert.ok(result.steady.operations.some(row => row.missed > 0));
  assert.equal(result.targetsMet, false);
  assert.equal(result.ramp.metrics.attempts + result.steady.metrics.attempts +
    [...result.ramp.operations, ...result.steady.operations].reduce((n, row) => n + row.missed, 0), schedule.events.length);
});

test('a delayed generator is visible and cannot claim healthy latency', async () => {
  const clock = fakeClock();
  const result = await runSessionSchedule(makeSessionSchedule(small), async () => ok(), {
    ...clock, sleep: ms => clock.sleep(ms + 250),
  });
  assert.equal(result.targetsMet, false);
  assert.ok(result.steady.operations.some(row => row.schedulingP95Ms > 100 || row.missed > 0));
});

test('read and transport failures keep counts but never copy response data or exception messages', async t => {
  const query = loadOperations[0], config = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'test' };
  const fake = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 'PGRST003', message: 'private@example.invalid secret-message', token: 'private-token' }), { status: 504 }));
  const failure = await readLoadPage(config, 'private-token', query);
  assert.equal(failure.ok, false); assert.equal(failure.code, 'PGRST003');
  assert.ok(failure.ms >= 0);
  fake.mock.mockImplementation(async () => { throw new Error('private@example.invalid private-token'); });
  const transport = await readLoadPage(config, 'private-token', query);
  assert.equal(transport.code, 'TRANSPORT_ERROR');
  fake.mock.mockImplementation(async () => new Response('{}', { status: 200 }));
  assert.equal((await readLoadPage(config, 'private-token', query)).code, 'INVALID_CONTRACT');
  const result = await runSessionSchedule(makeSessionSchedule(small), async () => { throw Error('private@example.invalid'); }, fakeClock());
  assert.equal(result.targetsMet, false);
  const text = JSON.stringify({ failure, transport, result });
  for (const secret of ['private@example.invalid', 'private-token', 'secret-message']) assert.ok(!text.includes(secret));
});

test('pool metrics are allowlisted numbers; missing diagnostics are never a healthy empty pool', () => {
  const metrics = `pgrst_db_pool_available 4\npgrst_db_pool_waiting 8\npgrst_db_pool_max 10\npgrst_db_pool_timeouts_total 1.2e2\n`;
  assert.deepEqual(poolMetrics(metrics + 'secret private@example.invalid\n'), { available: 4, waiting: 8, max: 10, timeouts: 120 });
  assert.equal(poolMetrics(''), null);
  assert.equal(poolMetrics(metrics.replace('waiting 8', 'waiting NaN')), null);
  assert.equal(poolMetrics(metrics.replace('waiting 8', 'waiting -1')), null);
  assert.equal(poolMetrics(metrics.replace('pgrst_db_pool_waiting 8', 'pgrst_db_pool_waiting{user="private"} 8')), null);
});

test('container and database diagnostics discard identities, network data, SQL and unknown fields', () => {
  const row = dockerUsage({ Name: 'private@example.invalid', ID: 'secret', CPUPerc: '125.50%', MemPerc: '5.00%',
    MemUsage: '1.5GiB / 4GiB', PIDs: '42', NetIO: 'private-token', BlockIO: 'select secret' });
  assert.deepEqual(row, { cpuCorePercent: 125.5, memoryPercent: 5, memoryBytes: 1610612736, memoryLimitBytes: 4294967296, pids: 42 });
  assert.deepEqual(dockerUsage({}), { cpuCorePercent: null, memoryPercent: null, memoryBytes: null, memoryLimitBytes: null, pids: null });
  const db = { active: 1, idle: 2, lockWaiters: 0, ioWaiters: 1, longestActiveMs: 50, commits: 100,
    rollbacks: 0, tempBytes: 0, blocksRead: 30, blocksHit: 70, deadlocks: 0 };
  assert.deepEqual(databaseMetrics({ ...db, query: 'select private', email: 'private@example.invalid' }), db);
  assert.equal(databaseMetrics({ ...db, active: 'private' }), null);
  assert.equal(databaseMetrics(null), null);
});

test('resource aggregates retain unavailable fields and detect counters reset during a run', () => {
  const summary = summarizeResources([
    { elapsedMs: 0, database: { active: 2, commits: 5 }, pool: { waiting: 1, timeouts: 20 }, containers: {} },
    { elapsedMs: 5000, database: null, pool: null, containers: { database: { cpuCorePercent: 150, memoryBytes: 42, pids: 4 } } },
    { elapsedMs: 11000, database: { active: 3, commits: 3 }, pool: { waiting: 4, timeouts: 2 }, containers: {} },
  ]);
  assert.equal(summary.maxSampleGapMs, 6000);
  assert.equal(summary.databaseSamples, 2);
  assert.equal(summary.peakActiveConnections, 3);
  assert.equal(summary.peakPoolWaiting, 4);
  assert.equal(summary.databaseDeltas.commits, null);
  assert.equal(summary.poolTimeoutsDelta, null);
  assert.equal(summary.services.database.peakCpuCorePercent, 150);
  assert.equal(summary.services.postgrest.peakMemoryBytes, null);
  assert.equal(summarizeResources([]).peakPoolWaiting, null);
});

test('the separate generator uses real HTTP and IPC without returning auth or response payloads', { timeout: 10000 }, async t => {
  let requests = 0;
  const id = '11111111-1111-4111-8111-111111111111';
  const card = { crew: { id, name: 'private-profile' }, trip: { id, description: 'private-description' }, compatibility: { score: 70 } };
  const server = createServer((request, response) => {
    requests++;
    const body = request.url.endsWith('/get_my_sync_state')
      ? { revision: 0, unread_messages: 0, pending_invitations: 0, unread_notifications: 0, active_trips: 5, archived_trips: 0 }
      : request.url.endsWith('/get_my_mailbox_page') ? { conversations: [{ text: 'private-message' }], invitations: [{}], pages: {} }
      : { items: Array(5).fill(card), total_count: 50000, has_more: true, cursor: {} };
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const worker = fork(new URL('./session-load-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => worker.kill());
  let output = '';
  worker.stdout.on('data', data => { output += data; }); worker.stderr.on('data', data => { output += data; });
  const complete = new Promise((resolve, reject) => {
    worker.on('message', message => { if (message.type === 'complete') resolve(message); if (message.type === 'failed') reject(Error('Worker failed')); });
    worker.on('error', reject);
    worker.on('exit', code => { if (code) reject(Error('Worker exited')); });
  });
  worker.send({ config: { API_URL: `http://127.0.0.1:${server.address().port}`, ANON_KEY: 'private-test-key', JWT_SECRET: 'private-test-signing-key' },
    settings: { sessions: 2, rampMs: 50, steadyMs: 500, syncMs: 100, actionMinMs: 20, actionMaxMs: 30, minimumSamples: 1 } });
  const message = await complete;
  assert.ok(requests > 10);
  assert.equal(message.result.ramp.metrics.attempts + message.result.steady.metrics.attempts, requests);
  assert.equal(message.result.steady.metrics.failed, 0);
  assert.ok(message.generator.peakRssBytes > 0);
  const report = JSON.stringify(message) + output;
  for (const secret of ['private-test', 'private-profile', 'private-description', 'private-message', id, 'Bearer']) assert.ok(!report.includes(secret));
});

test('the generator rejects hosted URLs before any request is sent', { timeout: 10000 }, async t => {
  const worker = fork(new URL('./session-load-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => worker.kill());
  const failed = new Promise((resolve, reject) => {
    worker.on('message', resolve); worker.on('error', reject);
  });
  worker.send({ config: { API_URL: 'https://example.invalid', ANON_KEY: 'private', JWT_SECRET: 'private' }, settings: small });
  assert.deepEqual(await failed, { type: 'failed' });
});
