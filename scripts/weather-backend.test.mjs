import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {asUser, profile, testDatabase, trip} from './support/database.mjs';

test('weather authorizes stored trips, resolves manual/Google geometry, limits requests and keeps cache server-only', async () => {
  const db = await testDatabase(), users = [randomUUID(), randomUUID()], groups = [];
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const context = id => rpc('get_my_trip_weather_context', [id]);
  try {
    for (const user of users) {
      await db.exec('reset role'); await db.query('insert into auth.users(id) values($1)', [user]); await asUser(db, user);
      groups.push((await rpc('save_my_profile', [profile('Ekipa ' + groups.length)])).group.id);
    }
    await asUser(db, users[1]);
    const published = await rpc('save_my_trip', [trip, null, false, randomUUID()]);
    const draft = await rpc('save_my_trip', [trip, null, true, randomUUID()]);
    assert.equal((await context(draft.id)).start_date, trip.start_date);
    await asUser(db, users[0]);
    assert.equal(await context(draft.id), null);
    assert.equal(await context(randomUUID()), null);
    const legacy = await context(published.id);
    assert.equal(legacy.start_date, trip.start_date); assert.equal(typeof legacy.latitude, 'number');
    await assert.rejects(db.query('select * from weather_private.cache'), {code: '42501'});
    await assert.rejects(rpc('get_trip_weather_cache', ['a,b']), {code: '42501'});
    await assert.rejects(rpc('put_trip_weather_cache', ['a,b', {}]), {code: '42501'});
    await rpc('set_group_block', [groups[1], true]); assert.equal(await context(published.id), null);
    await rpc('set_group_block', [groups[1], false]);
    await asUser(db, users[1]);
    const pin = {id: 'manual:' + randomUUID(), source: 'manual', kind: 'place', name: 'Polana', address: '', region: '', country: '', latitude: 54, longitude: 18};
    const manual = await rpc('save_my_trip', [{...trip, place_data: pin}, null, false, randomUUID()]);
    const point = await context(manual.id); assert.equal(point.latitude, 54); assert.equal(point.longitude, 18);
    const google = {id: 'google:ChIJ_weather', source: 'google', googlePlaceId: 'ChIJ_weather', kind: 'campground', name: 'Kemping', userLabel: 'Kemping', address: '', region: '', country: ''};
    const modern = await rpc('save_my_trip', [{...trip, place_data: google}, null, false, randomUUID()]);
    assert.equal((await context(modern.id)).latitude, null);
    await db.exec('reset role;set role service_role'); await rpc('record_google_place_geometry', ['ChIJ_weather', 53, 17, null]);
    await rpc('put_trip_weather_cache', ['54,18', {days: [], alerts: []}]);
    assert.deepEqual(await rpc('get_trip_weather_cache', ['54,18']), {days: [], alerts: []});
    await asUser(db, users[1]); assert.equal((await context(modern.id)).latitude, 53);
    await db.exec('reset role');
    await db.query("update weather_private.cache set expires_at=now()-interval '1 minute'");
    await db.exec('set role service_role'); assert.equal(await rpc('get_trip_weather_cache', ['54,18']), null);
    await db.exec('reset role;select weather_private.expire_cache()');
    assert.equal((await db.query('select count(*)::integer n from weather_private.cache')).rows[0].n, 0);
    await db.query('update weather_private.request_budgets set minute_count=30 where user_id=$1', [users[0]]);
    await asUser(db, users[0]); await assert.rejects(context(published.id), {code: '54000'});
    await db.exec('reset role;set role anon'); await assert.rejects(context(published.id), {code: '42501'});
  } finally {await db.close();}
});
