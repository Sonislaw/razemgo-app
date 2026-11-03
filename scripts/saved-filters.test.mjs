import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { INITIAL_FILTERS } from '../src/features/discovery/filter-trips.ts';
import { INITIAL_GROUP_FILTERS } from '../src/features/groups/group-data.ts';
import { filterSetPayload, parseSavedFilterSet, sameFilterCriteria, copyFilterCriteria, filterSetExpired, filterSetSummary, filterSetNameError } from '../src/features/saved-filters/saved-filter-data.ts';
import { createSavedFilterStore } from '../src/features/saved-filters/saved-filter-store.ts';
const row = (kind, filters, name = 'Zestaw', id = randomUUID()) => ({ id, kind, name, filters, schema_version: 1,
  created_at: '2026-11-03T12:00:00Z', updated_at: '2026-11-03T12:00:00Z' });
const draft = { kind: 'trips', filters: { ...INITIAL_FILTERS, tripModes: ['planned'], location: 'Mazury', dateRangeId: 'own-trip', sourceTripId: randomUUID(),
  customDateRange: { startDate: '2027-05-01', endDate: '2027-05-05' }, dateFlexibilityDays: 3,
  groupKinds: ['family'], childAgeBands: ['4–6'], animalKinds: ['dog'], landscapeKinds: ['lake'], favoritesOnly: true } };
test('saved trip criteria are detached copies, preserve all criteria and retain expired dates', () => {
  const payload = filterSetPayload(draft), saved = parseSavedFilterSet(row('trips', payload));
  assert.equal(payload.source_trip_id, undefined); assert.equal(saved.filters.sourceTripId, undefined); assert.equal(saved.filters.dateRangeId, 'custom');
  assert.equal(sameFilterCriteria(draft, saved), true); assert.equal(saved.filters.dateFlexibilityDays, 3);
  const copy = copyFilterCriteria(saved); copy.filters.customDateRange.startDate = '2028-01-01'; copy.filters.childAgeBands.push('7–9');
  assert.equal(saved.filters.customDateRange.startDate, '2027-05-01'); assert.deepEqual(saved.filters.childAgeBands, ['4–6']);
  assert.equal(filterSetExpired(saved, '2027-05-05'), true); assert.equal(filterSetExpired(saved, '2027-05-04'), false);
  assert.match(filterSetSummary(saved), /2027/); assert.match(filterSetSummary(saved), /Mazury/); assert.match(filterSetSummary(saved), /±3/);
});
test('saved crew criteria include name, online, favorites, interests and the stored Van value', () => {
  const value = { kind: 'groups', filters: { ...INITIAL_GROUP_FILTERS, name: '#104827', travelModes: ['Van'], interests: ['Rowery'],
    groupKinds: ['family'], childAgeBands: ['7–9'], animalKinds: ['cat'], hasTrips: true, onlineOnly: true, favoritesOnly: true } };
  const saved = parseSavedFilterSet(row('groups', filterSetPayload(value)));
  assert.deepEqual(saved.filters, value.filters); assert.match(filterSetSummary(saved), /Kampervan/); assert.match(filterSetSummary(saved), /Tylko online/);
});
test('invalid or unsupported saved criteria never turn into broader searches', () => {
  for (const filters of [{ ...draft.filters, customDateRange: { startDate: 'bad', endDate: '2027-05-05' } }, { ...draft.filters, locationId: 'unknown' }])
    assert.throws(() => filterSetPayload({ kind: 'trips', filters }));
  const valid = row('trips', filterSetPayload(draft));
  for (const invalid of [{ ...valid, schema_version: 2 }, { ...valid, filters: { ...valid.filters, source_trip_id: randomUUID() } },
    { ...valid, filters: { ...valid.filters, child_age_bands: ['bad'] } }]) assert.throws(() => parseSavedFilterSet(invalid));
  assert.ok(filterSetNameError(' ')); assert.ok(filterSetNameError('x'.repeat(41))); assert.equal(filterSetNameError('🦊'.repeat(40)), undefined);
});
test('store survives retries, rejects duplicate names and isolates disposed account requests', async () => {
  let persisted = [], failSave = false;
  const transport = {
    load: async () => persisted,
    save: async request => {
      const existing = persisted.find(item => item.id === request.id);
      const item = request.filters === null ? { ...existing, name: request.name } : parseSavedFilterSet(row(request.kind, request.filters, request.name, request.id));
      persisted = [...persisted.filter(old => old.id !== request.id), item];
      if (failSave) throw Error('Lost acknowledgement');
      return item;
    }, remove: async id => { persisted = persisted.filter(item => item.id !== id); return true; },
  };
  const a = createSavedFilterStore(transport); await a.refresh();
  const request = { id: randomUUID(), name: 'Rodziny', kind: 'trips', filters: filterSetPayload(draft) };
  failSave = true; assert.ok((await a.save(request)).error); assert.equal(a.getSnapshot().items.length, 0);
  failSave = false; assert.ok((await a.save(request)).item); assert.equal(persisted.length, 1);
  assert.ok((await a.save({ ...request, id: randomUUID(), name: 'rodziny' })).error);
  const b = createSavedFilterStore(transport); await b.refresh(); assert.equal(b.getSnapshot().items.length, 1);
  await a.save({ ...request, name: 'Rodziny po zmianie', filters: null }); await b.refresh(); assert.equal(b.getSnapshot().items[0].name, 'Rodziny po zmianie');
  await a.remove(request.id); await b.refresh(); assert.equal(b.getSnapshot().items.length, 0);
  let release; const pending = createSavedFilterStore({ ...transport, load: () => new Promise(resolve => { release = resolve; }) });
  const loading = pending.refresh(); await Promise.resolve(); pending.dispose(); release([parseSavedFilterSet(row('trips', request.filters))]); await loading;
  assert.equal(pending.getSnapshot().items.length, 0);
});
test('a stale read cannot overwrite an acknowledged mutation', async () => {
  const item = parseSavedFilterSet(row('trips', filterSetPayload(draft)));
  let nextLoad, calls = 0;
  const store = createSavedFilterStore({ load: async () => ++calls === 1 ? [] : calls === 2 ? new Promise(resolve => { nextLoad = resolve; }) : [item],
    save: async () => item, remove: async () => true });
  await store.refresh(); const pending = store.refresh(); await Promise.resolve();
  await store.save({ id: item.id, name: item.name, kind: 'trips', filters: filterSetPayload(item) });
  nextLoad([]); await pending; await store.refresh();
  assert.equal(store.getSnapshot().items[0].id, item.id);
});
test('subscription saves retain criteria, wait for acknowledgement and ignore a disposed account',async()=>{
  const item=parseSavedFilterSet(row('trips',filterSetPayload(draft)));
  let fail=true,release;
  const store=createSavedFilterStore({load:async()=>[item],save:async()=>item,remove:async()=>true,
    setNotifications:async(id,enabled)=>{if(fail)throw Error('Offline');return {...item,notificationsEnabled:enabled};}});
  await store.refresh();assert.ok((await store.setNotifications(item.id,true)).error);assert.equal(store.getSnapshot().items[0].notificationsEnabled,false);
  fail=false;const result=await store.setNotifications(item.id,true);assert.equal(result.item.notificationsEnabled,true);
  assert.equal(sameFilterCriteria(item,result.item),true);
  const pending=createSavedFilterStore({load:async()=>[item],save:async()=>item,remove:async()=>true,
    setNotifications:()=>new Promise(resolve=>{release=resolve;})});
  await pending.refresh();const request=pending.setNotifications(item.id,true);await Promise.resolve();pending.dispose();
  release({...item,notificationsEnabled:true});assert.equal((await request).item,null);assert.equal(pending.getSnapshot().items[0].notificationsEnabled,false);
});
