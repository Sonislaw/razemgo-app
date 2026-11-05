import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTutorialStore, parseTutorialState } from '../src/features/tutorial/tutorial-store.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(overrides = {}) {
  let cache = null, remote = null;
  const saves = [];
  const store = createTutorialStore({
    readCache: async () => cache, writeCache: async value => { cache = value; },
    load: async () => remote, save: async value => { saves.push(value); remote = value; return value; }, ...overrides,
  });
  return { store, saves, cache: () => cache };
}
test('tutorial only offers after a successful account read; completed accounts are cached', async () => {
  const a = setup(); assert.equal(a.store.getSnapshot().loaded, false);
  await a.store.synchronize(); assert.deepEqual(a.store.getSnapshot(), { loaded: true, status: null, pending: false });
  const b = setup({ load: async () => 'completed' }); await b.store.synchronize();
  assert.equal(b.store.getSnapshot().status, 'completed');
  assert.deepEqual(JSON.parse(b.cache()), { status: 'completed', pending: false });
  const failed = setup({ load: async () => { throw Error('Offline'); } });
  assert.equal(await failed.store.synchronize(), false); assert.equal(failed.store.getSnapshot().loaded, false);
});
test('skip closes immediately while offline and survives a restart until retry succeeds', async () => {
  let offline = true;
  const a = setup({ save: async value => { if (offline) throw Error('Offline'); return value; } });
  await a.store.synchronize(); a.store.finish('skipped');
  assert.equal(a.store.getSnapshot().status, 'skipped');
  assert.equal(await a.store.synchronize(), false); assert.equal(a.store.getSnapshot().pending, true);
  const b = setup({ readCache: async () => a.cache(), load: async () => { throw Error('Must not reload pending decision'); } });
  await b.store.synchronize(); assert.deepEqual(b.saves, ['skipped']);
  assert.equal(b.store.getSnapshot().pending, false);
  offline = false; await a.store.synchronize(); assert.equal(a.store.getSnapshot().pending, false);
});
test('a late account read cannot undo skipping; concurrent synchronization is single-flight', async () => {
  const waiting = deferred(); let loads = 0;
  const a = setup({ load: () => { loads++; return waiting.promise; } });
  const first = a.store.synchronize(); assert.equal(first, a.store.synchronize());
  await Promise.resolve(); await Promise.resolve(); a.store.finish('skipped');
  waiting.resolve(null); await first;
  assert.equal(loads, 1); assert.equal(a.store.getSnapshot().status, 'skipped'); assert.deepEqual(a.saves, ['skipped']);
});
test('a delayed cache read cannot undo a new completion', async () => {
  const waiting = deferred(); const a = setup({ readCache: () => waiting.promise });
  const running = a.store.synchronize(); a.store.finish('completed');
  waiting.resolve(JSON.stringify({ status: 'skipped', pending: false })); await running;
  assert.equal(a.store.getSnapshot().status, 'completed'); assert.deepEqual(a.saves, ['completed']);
});
test('completion wins over replay skip and in-flight saves flush the latest decision', async () => {
  const waiting = deferred(); const saves = [];
  const a = setup({ save: async value => { saves.push(value); if (saves.length === 1) await waiting.promise; return value; } });
  await a.store.synchronize(); a.store.finish('skipped');
  await Promise.resolve(); a.store.finish('completed'); waiting.resolve(); await a.store.synchronize();
  assert.deepEqual(saves, ['skipped', 'completed']);
  a.store.finish('skipped'); await a.store.synchronize();
  assert.equal(a.store.getSnapshot().status, 'completed'); assert.equal(saves.at(-1), 'completed');
  assert.deepEqual(JSON.parse(a.cache()), { status: 'completed', pending: false });
});
test('cached decisions skip network reads and a late result cannot update a stopped account', async () => {
  const a = setup({ readCache: async () => '{"status":"skipped","pending":false}', load: async () => { throw Error('Unexpected fetch'); } });
  assert.equal(await a.store.synchronize(), true); assert.equal(a.store.getSnapshot().status, 'skipped');
  const waiting = deferred(); const b = setup({ load: () => waiting.promise });
  const pending = b.store.synchronize(); await Promise.resolve(); await Promise.resolve(); b.store.stop();
  waiting.resolve('completed'); await pending; assert.equal(b.store.getSnapshot().loaded, false);
});
test('response validation rejects malformed or unsupported tutorial formats', () => {
  for (const value of [null, {}, { version: 2, status: null }, { version: 1, status: 'seen' }]) assert.throws(() => parseTutorialState(value));
  assert.equal(parseTutorialState({ version: 1, status: null }), null);
  assert.equal(parseTutorialState({ version: 1, status: 'skipped' }), 'skipped');
});
