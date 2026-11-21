import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase, trip } from './support/database.mjs';

test('adult age bands survive old-client edits and remain specific to the trip', async () => {
  const db = await testDatabase();
  const organizer = randomUUID();
  const viewer = randomUUID();
  const rpc = async (name, args) => {
    const placeholders = args.map((_, index) => '$' + (index + 1)).join(', ');
    return (await db.query('select public.' + name + '(' + placeholders + ') as result', args)).rows[0].result;
  };

  try {
    await db.query('insert into auth.users(id) values($1),($2)', [organizer, viewer]);
    await asUser(db, organizer);
    const form = profile('Ekipa testowa');
    const bands = ['26–49', '50+'];
    const savedProfile = await rpc('save_my_profile', [{ ...form, adult_age_bands: bands }]);
    assert.deepEqual(savedProfile.group.adult_age_bands, bands);
    const olderEdit = await rpc('save_my_profile', [form]);
    assert.deepEqual(olderEdit.group.adult_age_bands, bands);

    const tripBands = ['18–25', '26–49'];
    const plan = await rpc('save_my_trip', [{ ...trip, adult_age_bands: tripBands }, null, false, randomUUID()]);
    assert.deepEqual(plan.adult_age_bands, tripBands);
    const olderTripEdit = await rpc('save_my_trip', [trip, plan.id, false, null]);
    assert.deepEqual(olderTripEdit.adult_age_bands, tripBands);
    const draft = await rpc('duplicate_my_trip', [plan.id]);
    assert.deepEqual(draft.adult_age_bands, tripBands);

    await assert.rejects(rpc('save_my_trip', [
      { ...trip, adult_count: 1, adult_age_bands: tripBands }, plan.id, false, null,
    ]), { code: '23514' });
    await assert.rejects(rpc('save_my_profile', [
      { ...form, adult_age_bands: ['50+', '50+'] },
    ]), { code: '23514' });

    await asUser(db, viewer);
    const viewerProfile = await rpc('save_my_profile', [profile('Ekipa czytająca')]);
    assert.deepEqual(viewerProfile.group.adult_age_bands, []);
    const details = await rpc('get_discovery_trip_v3', [plan.id]);
    assert.deepEqual(details.trip.adult_age_bands, tripBands);
    assert.deepEqual(details.crew.adult_age_bands, bands);
  } finally {
    await db.close();
  }
});
