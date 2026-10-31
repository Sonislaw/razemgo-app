import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';
import { createEmptyProfile } from '../src/features/profile/profile-data.ts';
import { newTripForm, toTripForm, tripFromForm, validateTripForm } from '../src/features/trips/own-trips-state.ts';
import { tripFromRow, tripToPayload } from '../src/features/trips/trip-mapper.ts';
import { validateTripParticipants, tripParticipantsSummary } from '../src/lib/trip-participants.ts';

test('trip participants are an independent snapshot, with required counts and ages only when children travel', () => {
  const owner = createEmptyProfile();
  owner.group.adultCount = 2; owner.group.childCount = 1; owner.group.childAgeBands = ['4–6'];
  const form = newTripForm(owner);
  assert.deepEqual(form.participants, { adultCount: 2, childCount: 1, childAgeBands: ['4–6'] });
  form.participants = { adultCount: 4, childCount: 0, childAgeBands: [] };
  const saved = tripFromForm(form, 'trip', 'group', 'draft');
  owner.group.childAgeBands = ['13–17'];
  assert.deepEqual(saved.participants, form.participants);
  assert.notEqual(saved.participants, form.participants);
  assert.deepEqual(toTripForm(saved).participants, form.participants);
  assert.equal(tripParticipantsSummary(saved.participants), '4 dorosłych');
  assert.equal(tripParticipantsSummary(null), 'Skład wyjazdu do uzupełnienia');
  for (const value of [null, { adultCount: 0, childCount: 0, childAgeBands: [] },
    { adultCount: 2, childCount: 1, childAgeBands: [] },
    { adultCount: 2, childCount: 0, childAgeBands: ['4–6'] },
    { adultCount: 2, childCount: 1, childAgeBands: ['4–6', '7–9'] },
    { adultCount: 21, childCount: 0, childAgeBands: [] }]) assert.ok(validateTripParticipants(value).length);
  assert.deepEqual(validateTripParticipants({ adultCount: 12, childCount: 3, childAgeBands: ['7–9'] }), []);
  form.participants = null;
  assert.ok(validateTripForm(form, 2).some(error => error.includes('skład')));
});

test('trip participant SQL: required publication, draft completion, ownership, filters and independent profile changes', async t => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID()]; const groups = [];
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const save = (patch = {}, id = null, draft = false) => rpc('save_my_trip', [{ ...trip, ...patch }, id, draft, randomUUID()]);
  try {
    await db.query('insert into auth.users values($1),($2)', users);
    for (const user of users) { await asUser(db, user); groups.push((await rpc('save_my_profile', [profile('Ekipa')])).group.id); }
    await asUser(db, users[0]);
    const own = await save({ adult_count: 5, child_count: 0, child_age_bands: [] });
    await asUser(db, users[1]);
    const other = await save({ adult_count: 3, child_count: 2, child_age_bands: ['7–9'] });
    await t.test('API and direct writes cannot publish missing, invalid or inconsistent compositions', async () => {
      for (const patch of [{ adult_count: null }, { child_count: null }, { adult_count: 0 }, { child_count: -1 },
        { child_count: 1, child_age_bands: [] }, { child_count: 0, child_age_bands: ['4–6'] },
        { child_count: 1, child_age_bands: ['4–6', '4–6'] }, { child_count: 21 }])
        await assert.rejects(save(patch), error => error.code === '23514');
      await assert.rejects(db.query('update public.trip_plans set child_count=0 where id=$1', [other.id]), error => error.code === '23514');
      await assert.rejects(db.query('update public.trip_plans set adult_count=null,child_count=null,child_age_bands=\'{}\' where id=$1', [other.id]), error => error.code === '23514');
    });
    await t.test('an incomplete draft loads and duplicates, but ages are required for publication', async () => {
      const draft = await save({ child_count: 2, child_age_bands: [] }, null, true);
      assert.equal(tripFromRow(draft).participants.childCount, 2);
      await assert.rejects(save({ child_count: 2, child_age_bands: [] }, draft.id), error => error.code === '23514');
      const copy = await rpc('duplicate_my_trip', [draft.id]);
      assert.equal(copy.child_count, 2); assert.deepEqual(copy.child_age_bands, []);
      await save({ child_count: 2, child_age_bands: ['7–9'] }, draft.id);
      await rpc('delete_my_trip', [draft.id]); await rpc('delete_my_trip', [copy.id]);
    });
    await asUser(db, users[0]);
    await t.test('public cards, detail and filters use the journey rather than either crew profile', async () => {
      await rpc('save_my_profile', [{ ...profile('Zmieniona ekipa'), adult_count: 1, child_count: 0, child_age_bands: [] }]);
      await rpc('save_my_profile', [{ ...profile('Ekipa z dzieckiem'), child_age_bands: ['7–9'] }]);
      const detail = await rpc('get_discovery_trip_v2', [other.id]);
      assert.equal(detail.trip.adult_count, 3); assert.equal(detail.trip.child_count, 2);
      assert.deepEqual(detail.trip.child_age_bands, ['7–9']);
      assert.equal(detail.recommendation.reasons.some(reason => reason.code === 'child_age'), false);
      const count = ages => rpc('count_public_trips', [{ child_age_bands: ages }]);
      assert.equal(await count(['4–6']), 0); assert.equal(await count(['7–9']), 1);
      const page = await rpc('search_public_trips_v2', [{ child_age_bands: ['7–9'] }, 'compatibility', null, 5]);
      assert.deepEqual(page.items[0].trip, detail.trip);
      const self = (await db.query('select to_jsonb(t) value from public.trip_plans t where id=$1', [own.id])).rows[0].value;
      assert.equal(self.adult_count, 5); assert.equal(self.child_count, 0);
      await save({ adult_count: 5, child_count: 1, child_age_bands: ['7–9'] }, own.id);
      await rpc('save_my_profile', [{ ...profile('Ekipa bez dzieci'), child_count: 0, child_age_bands: [] }]);
      assert.equal((await rpc('get_discovery_trip_v2', [other.id])).recommendation.reasons.some(reason => reason.code === 'child_age'), true);
      await save({ adult_count: 5, child_count: 0, child_age_bands: [] }, own.id);
      const copied = await rpc('duplicate_my_trip', [own.id]);
      assert.deepEqual(tripFromRow(copied).participants, tripFromRow(own).participants);
      await rpc('delete_my_trip', [copied.id]);
    });
    await t.test('unknown legacy compositions never become the current profile and require completion on edit', async () => {
      await db.exec('reset role; alter table public.trip_plans disable trigger user');
      await db.query("update public.trip_plans set adult_count=null,child_count=null,child_age_bands='{}' where id=$1", [own.id]);
      await db.exec('alter table public.trip_plans enable trigger user'); await asUser(db, users[0]);
      const legacy = (await db.query('select to_jsonb(t) value from public.trip_plans t where id=$1', [own.id])).rows[0].value;
      assert.equal(tripFromRow(legacy).participants, null);
      await assert.rejects(db.query("update public.trip_plans set description='Niepełny skład nie może ominąć formularza.' where id=$1", [own.id]), error => error.code === '23514');
      await rpc('change_my_trip_status', [own.id, 'paused']);
      await assert.rejects(rpc('change_my_trip_status', [own.id, 'published']), error => error.code === '23514');
      const empty = tripToPayload(toTripForm(tripFromRow(legacy)));
      await assert.rejects(rpc('save_my_trip', [empty, own.id, false]), error => error.code === '23514');
      const edited = await save({ adult_count: 6, child_count: 0, child_age_bands: [] }, own.id);
      assert.equal(edited.adult_count, 6);
      await rpc('change_my_trip_status', [own.id, 'published']);
      await asUser(db, users[1]);
      assert.deepEqual((await db.query('select adult_count,child_count from public.trip_plans where id=$1', [own.id])).rows, []);
      const detail = await rpc('get_discovery_trip_v2', [own.id]); assert.equal(detail.trip.adult_count, 6);
    });
  } finally { await db.close(); }
});
