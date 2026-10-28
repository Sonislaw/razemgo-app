import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backendLifecycle,
  createRequestLifecycle,
  withAccountRequests,
} from '../src/lib/request-lifecycle.ts';
import { backendRequest } from '../src/lib/backend-request.ts';
import {
  resetRequestMetrics,
  requestMetrics,
  setRequestMetricsEnabled,
} from '../src/lib/request-metrics.ts';
import {
  createSnapshotStore,
  createActionStore,
  createSelectionCache,
  selectedSnapshot,
} from '../src/lib/snapshot-store.ts';
import { createAccountSync } from '../src/lib/account-sync.ts';
import {
  allowMapNavigation,
  isGoogleMapUrl,
} from '../src/components/trips/map-navigation.ts';
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('request lifecycle invalidates late data across signout, another account and repeated logins', () => {
  const lifecycle = createRequestLifecycle();
  lifecycle.setAccount('a');
  const old = lifecycle.capture();
  lifecycle.setAccount('a');
  old.assertCurrent();
  lifecycle.setAccount(null);
  assert.equal(old.signal.aborted, true);
  assert.throws(old.assertCurrent, { name: 'AbortError' });
  lifecycle.setAccount('a');
  assert.throws(old.assertCurrent, { name: 'AbortError' });
});
test('a timeout bounds transports that ignore AbortSignal', async () => {
  await assert.rejects(
    backendRequest(() => new Promise(() => {}), 'trips.load', { timeoutMs: 5 }),
    { name: 'TimeoutError' },
  );
});
test('screen cancellation and account changes reject late results, without retrying a write', async () => {
  backendLifecycle.setAccount('a');
  let resolve;
  const pending = backendRequest(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    'profile.save',
  );
  await flush();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  backendLifecycle.setAccount('b');
  resolve({ data: { private: 'a' } });
  await rejected;
  const controller = new AbortController();
  controller.abort();
  let called = 0;
  await assert.rejects(
    backendRequest(
      async () => {
        called++;
      },
      'trips.load',
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
  assert.equal(called, 0);
  let writes = 0;
  await assert.rejects(
    backendRequest(
      async () => {
        writes++;
        throw new TypeError('offline');
      },
      'profile.save',
      { retries: 1 },
    ),
    TypeError,
  );
  assert.equal(writes, 1);
  backendLifecycle.setAccount(null);
});
test('only explicitly safe reads retry once and diagnostics retain aggregates only', async () => {
  let reads = 0;
  setRequestMetricsEnabled(true);
  resetRequestMetrics();
  const value = await backendRequest(
    async () => {
      if (++reads === 1) throw new TypeError('offline');
      return { data: { text: 'sekretny tekst' } };
    },
    'trips.load',
    { read: true, retries: 1 },
  );
  assert.equal(reads, 2);
  assert.ok(value.data);
  const metrics = requestMetrics();
  assert.doesNotMatch(JSON.stringify(metrics), /sekretny|token|text/);
  assert.ok(JSON.stringify(metrics).includes('trips.load'));
  setRequestMetricsEnabled(false);
});
test('transport account guard protects REST and Edge even outside backendRequest', async () => {
  backendLifecycle.setAccount('a');
  let finish;
  const fetcher = withAccountRequests(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = fetcher('https://project.invalid/rest/v1/trip_plans');
  await flush();
  backendLifecycle.setAccount('b');
  finish(new Response('{}'));
  await assert.rejects(pending, { name: 'AbortError' });
  backendLifecycle.setAccount(null);
});
test('unrelated snapshot updates leave selected references and actions stable', () => {
  const store = createSnapshotStore({ a: { score: 50 }, b: 0 });
  const selected = selectedSnapshot(store, (s) => s.a),
    first = selected();
  store.publish({ a: first, b: 1 });
  assert.equal(selected(), first);
  const cache = createSelectionCache(),
    equals = (a, b) => a.items[0] === b.items[0];
  const selection = selectedSnapshot(
    store,
    (value) => ({ items: [value.a] }),
    equals,
    cache,
  )();
  // A component re-render can create a new selector; its first snapshot must
  // reuse the previous equal value, including derived arrays.
  assert.equal(
    selectedSnapshot(store, (value) => ({ items: [value.a] }), equals, cache)(),
    selection,
  );
  const calls = [],
    bridge = createActionStore({ count: 1, run: () => calls.push(1) }),
    action = bridge.store.getSnapshot().run;
  bridge.update({ count: 2, run: () => calls.push(2) });
  assert.equal(bridge.store.getSnapshot().run, action);
  action();
  assert.deepEqual(calls, [2]);
});
test('one scheduler merges event bursts, one followup, revision polls and inactivity', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = true,
    revision = '1',
    reads = 0,
    runs = 0,
    release;
  const sync = createAccountSync(
    () => active,
    async () => {
      reads++;
      return revision;
    },
  );
  sync.register('mailbox', async () => {
    runs++;
    await new Promise((resolve) => {
      release = resolve;
    });
  });
  sync.invalidate('event');
  sync.invalidate('push');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(runs, 1);
  revision = '2';
  sync.invalidate('event');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(runs, 1);
  release();
  await flush();
  assert.equal(runs, 2);
  release();
  await flush();
  sync.invalidate('poll');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(runs, 2);
  active = false;
  sync.invalidate('event');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(reads, 3);
  sync.dispose();
  t.mock.timers.reset();
});
test('old revision requests cannot restart jobs after dispose/re-activation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve,
    runs = 0;
  const sync = createAccountSync(
    () => true,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  sync.register('job', async () => {
    runs++;
  });
  t.mock.timers.tick(150);
  await flush();
  sync.dispose();
  sync.activate();
  sync.register('new', async () => {
    runs++;
  });
  resolve('old');
  await flush();
  assert.equal(runs, 0);
  sync.dispose();
  t.mock.timers.reset();
});
test('map navigation blocks hostile hosts, schemes, files and top-frame navigation', () => {
  for (const uri of [
    'javascript:alert(1)',
    'file:///secret',
    'http://maps.google.com/maps',
    'https://www.google.com.evil/maps',
    'https://evil@www.google.com/maps',
    'https://www.google.com/redirect',
    'https://www.google.com:444/maps',
  ])
    assert.equal(isGoogleMapUrl(uri), false, uri);
  const valid = 'https://maps.google.com/maps?output=embed&q=camp';
  assert.ok(isGoogleMapUrl(valid));
  assert.ok(allowMapNavigation(valid, false));
  assert.equal(allowMapNavigation(valid, true), false);
  assert.ok(allowMapNavigation('about:blank'));
});

test('a failed job retries on an unchanged revision; healthy jobs stay quiet', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0,
    healthy = 0;
  const sync = createAccountSync(
    () => true,
    async () => 'same',
  );
  sync.register('retry', async () => ++attempts > 1);
  sync.register('healthy', async () => {
    healthy++;
  });
  t.mock.timers.tick(150);
  await flush();
  assert.equal(attempts, 1);
  assert.equal(healthy, 1);
  sync.invalidate('poll');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(attempts, 2);
  assert.equal(healthy, 1);
  sync.invalidate('push');
  sync.invalidate('event');
  t.mock.timers.tick(150);
  await flush();
  assert.equal(attempts, 2);
  assert.equal(healthy, 1);
  sync.dispose();
  t.mock.timers.reset();
});
test('backgrounding during the revision read never consumes an unsynchronized revision', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = true,
    finish,
    runs = 0;
  const sync = createAccountSync(
    () => active,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  sync.register('mailbox', async () => {
    runs++;
  });
  t.mock.timers.tick(150);
  await flush();
  active = false;
  finish('new');
  await flush();
  assert.equal(runs, 0);
  active = true;
  sync.invalidate('foreground');
  t.mock.timers.tick(150);
  await flush();
  finish('new');
  await flush();
  assert.equal(runs, 1);
  sync.dispose();
  t.mock.timers.reset();
});
