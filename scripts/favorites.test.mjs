import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFavoritesStore } from '../src/features/favorites/favorites-store.ts';
import { INITIAL_GROUP_FILTERS, filterPublicGroups, groupFiltersPayload } from '../src/features/groups/group-data.ts';
import { INITIAL_FILTERS, filterProposals } from '../src/features/discovery/filter-trips.ts';
import { DEMO_PROPOSALS } from '../src/data/mocks/travel.ts';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const empty = () => ({ group_ids: [], trip_ids: [] });

test('favorites: only confirmed writes change hearts; failures and duplicate taps keep the saved state', async () => {
  let resolveWrite, calls = 0;
  const store = createFavoritesStore({ load: async () => empty(), save: () => { calls++; return new Promise(resolve => { resolveWrite = resolve; }); } });
  await store.refresh();
  const pending = store.setFavorite('group', 'crew', true);
  assert.equal(store.getSnapshot().groupIds.has('crew'), false);
  assert.equal(await store.setFavorite('group', 'crew', true), false); assert.equal(calls, 1);
  resolveWrite(true); assert.equal(await pending, true); assert.equal(store.getSnapshot().groupIds.has('crew'), true);
  const removal = store.setFavorite('group', 'crew', false); resolveWrite(true);
  assert.equal(await removal, false); assert.equal(store.getSnapshot().groupIds.has('crew'), true);
  const retry = store.setFavorite('group', 'crew', false); resolveWrite(false);
  assert.equal(await retry, true); assert.equal(store.getSnapshot().groupIds.size, 0);
  store.dispose();
});
test('favorites: stale reloads cannot overwrite an acknowledged write; another device is reflected on refresh', async () => {
  let data = empty(), resolveLoad;
  const transport = { load: async () => data, save: async (kind, id, selected) => { data = { group_ids: selected ? [id] : [], trip_ids: [] }; return selected; } };
  const store = createFavoritesStore(transport); await store.refresh();
  transport.load = () => new Promise(resolve => { resolveLoad = resolve; });
  const old = store.refresh(); await settle();
  await store.setFavorite('group', 'crew', true);
  transport.load = async () => data;
  resolveLoad(empty()); await old; await settle();
  assert.equal(store.getSnapshot().groupIds.has('crew'), true);
  data = { group_ids: [], trip_ids: ['trip-from-other-device'] };
  await store.refresh(); assert.equal(store.getSnapshot().groupIds.size, 0); assert.equal(store.getSnapshot().tripIds.has('trip-from-other-device'), true);
  store.dispose();
});
test('favorites: account disposal ignores late results, fresh accounts start empty, network errors retry honestly', async () => {
  let resolveOld;
  const old = createFavoritesStore({ load: () => new Promise(resolve => { resolveOld = resolve; }), save: async () => true });
  const pending = old.refresh(); await settle(); old.dispose(); resolveOld({ group_ids: ['previous-account'], trip_ids: [] }); await pending;
  assert.equal(old.getSnapshot().groupIds.size, 0);
  let fail = true;
  const fresh = createFavoritesStore({ load: async () => { if (fail) throw Error('Offline'); return empty(); }, save: async () => true });
  await fresh.refresh(); assert.equal(fresh.getSnapshot().status, 'error');
  assert.equal(await fresh.setFavorite('group', 'crew', true), false);
  fail = false; await fresh.refresh(); assert.equal(fresh.getSnapshot().status, 'ready'); assert.equal(fresh.getSnapshot().groupIds.size, 0);
  fresh.dispose();
});
test('favorites: both filter defaults are empty and favorites combine with existing criteria', () => {
  assert.equal(INITIAL_FILTERS.favoritesOnly, false); assert.equal(groupFiltersPayload(INITIAL_GROUP_FILTERS).favorites_only, false);
  const first = DEMO_PROPOSALS[0]; const ids = new Set([first.trip.id]);
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, favoritesOnly: true }, undefined, ids), [first]);
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, favoritesOnly: true }), []);
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, favoritesOnly: true, location: 'Nowhere' }, undefined, ids), []);
  const group = { group: first.group, about: '', activeTripCount: 1 };
  assert.deepEqual(filterPublicGroups([group], { ...INITIAL_GROUP_FILTERS, favoritesOnly: true }, undefined, new Set([first.group.id])), [group]);
  assert.deepEqual(filterPublicGroups([group], { ...INITIAL_GROUP_FILTERS, favoritesOnly: true }), []);
});
