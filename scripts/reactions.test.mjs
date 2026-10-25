import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReactionsStore } from '../src/features/reactions/reactions-store.ts';
import { REACTIONS, parseReactionSummary, reactionTotal, topReactions } from '../src/features/reactions/reaction-data.ts';

const summary = (id, mine = null) => ({ trip_id: id, available: true, can_react: true, mine, counts: mine ? { [mine]: 1 } : {} });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('five positive reactions validate counts and preserve zero and stable ties', () => {
  assert.equal(REACTIONS.length, 5);
  const value = parseReactionSummary({ ...summary('a'), counts: { love: 3, envy: 2, curious: 3 } });
  assert.equal(reactionTotal(value), 8); assert.deepEqual(topReactions(value).map(p => p.kind), ['love', 'curious', 'envy']);
  for (const patch of [{ mine: 'bad' }, { counts: { love: -1 } }, { counts: { envy: 1.5 } }, { counts: { fake: 1 } }])
    assert.throws(() => parseReactionSummary({ ...value, ...patch }));
});
test('mounted cards batch summary loads; repeated mounts share a cache and a pending save', async () => {
  const calls = [], pending = deferred();
  const store = createReactionsStore({ load: async ids => { calls.push(ids); return ids.map(id => summary(id)); }, save: () => pending.promise });
  const unwatch = store.watch('a'); store.watch('b'); store.watch('a'); await tick();
  assert.deepEqual(calls, [['a', 'b']]);
  const saved = store.setReaction('a', 'love');
  assert.equal(store.getSnapshot().items.get('a').mine, null); assert.ok(store.getSnapshot().busy.has('a'));
  assert.equal(await store.setReaction('a', 'envy'), false);
  pending.resolve(summary('a', 'love')); assert.equal(await saved, true);
  assert.equal(store.getSnapshot().items.get('a').mine, 'love'); unwatch(); store.dispose();
});
test('failed writes retain confirmed counts; explicit retry is idempotent and successful withdrawal clears the choice', async () => {
  let fail = true;
  const store = createReactionsStore({ load: async ids => ids.map(id => summary(id, 'love')), save: async (id, kind) => {
    if (fail) throw new Error('Offline'); return summary(id, kind);
  } });
  store.watch('a'); await tick(); assert.equal(await store.setReaction('a', 'envy'), false);
  assert.equal(store.getSnapshot().items.get('a').mine, 'love'); assert.ok(store.getSnapshot().errors.get('a'));
  fail = false; assert.equal(await store.setReaction('a', 'envy'), true); assert.equal(store.getSnapshot().errors.has('a'), false);
  assert.equal(await store.setReaction('a', null), true); assert.deepEqual(store.getSnapshot().items.get('a').counts, {}); store.dispose();
});
test('late refresh cannot overwrite a committed choice; another-device refresh replaces it afterwards', async () => {
  const stale = deferred(); let loads = 0;
  const store = createReactionsStore({ load: async ids => ++loads === 2 ? stale.promise : ids.map(id => summary(id, loads > 2 ? 'envy' : null)),
    save: async (id, kind) => summary(id, kind) });
  store.watch('a'); await tick(); const refresh = store.refresh(); await tick();
  await store.setReaction('a', 'love'); stale.resolve([summary('a')]); await refresh;
  assert.equal(store.getSnapshot().items.get('a').mine, 'love'); await tick();
  assert.equal(store.getSnapshot().items.get('a').mine, 'envy'); store.dispose();
});
test('account disposal ignores pending results and the next account never inherits reactions', async () => {
  const pending = deferred(); const store = createReactionsStore({ load: async ids => ids.map(id => summary(id)), save: () => pending.promise });
  store.watch('a'); await tick(); const saved = store.setReaction('a', 'love'); store.dispose(); pending.resolve(summary('a', 'love'));
  assert.equal(await saved, false); assert.equal(store.getSnapshot().items.get('a').mine, null);
  const next = createReactionsStore({ load: async ids => ids.map(id => summary(id)), save: async (id, kind) => summary(id, kind) });
  assert.equal(next.getSnapshot().items.size, 0); next.dispose();
});
test('failed summaries expose retry without inventing zero counts or enabling writes', async () => {
  let fail = true;
  const store = createReactionsStore({ load: async ids => { if (fail) throw new Error('Offline'); return ids.map(id => summary(id)); }, save: async (id, kind) => summary(id, kind) });
  store.watch('a'); await tick(); assert.equal(store.getSnapshot().items.has('a'), false);
  assert.ok(store.getSnapshot().errors.has('a')); assert.equal(await store.setReaction('a', 'love'), false);
  fail = false; await store.refresh(); assert.equal(store.getSnapshot().errors.has('a'), false); assert.equal(store.getSnapshot().items.get('a').mine, null); store.dispose();
});
