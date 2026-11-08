import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDatabase, asUser } from './support/database.mjs';
import { googlePlaceDetails, googlePlacePredictions } from '../shared/google-place-data.ts';

test('Google data parser rejects missing IDs and invalid geometry and returns only requested fields', () => {
  const data = { id: 'ChIJ_place', location: { latitude: 54.1, longitude: 18.2 },
    displayName: { text: 'Kemping' }, formattedAddress: 'Adres', types: ['campground'],
    addressComponents: [{ types: ['country'], shortText: 'PL' }], secret: 'discarded' };
  assert.equal(googlePlaceDetails(data).kind, 'campground');
  assert.equal(googlePlaceDetails(data).country, 'PL');
  assert.equal(googlePlaceDetails(data).secret, undefined);
  for (const value of [{ ...data, id: undefined }, { ...data, id: 12345 },
    { ...data, location: { latitude: NaN, longitude: 12 } },
    { ...data, location: { latitude: 54, longitude: 181 } }]) assert.throws(() => googlePlaceDetails(value));
  assert.deepEqual(googlePlacePredictions({ suggestions: [{ placePrediction: { placeId: undefined } }] }), []);
});

test('Places budgets are isolated and atomic; only the server can write geometry and expired coordinates are removed', async () => {
  const db = await testDatabase();
  const first = '00000000-0000-4000-8000-000000000011';
  const second = '00000000-0000-4000-8000-000000000012';
  try {
    await db.query('insert into auth.users(id) values ($1),($2)', [first, second]);
    await asUser(db, first);
    await assert.rejects(db.query("select public.record_google_place_geometry('ChIJ_place',54,18)"), { code: '42501' });
    await assert.rejects(db.query('select * from places_private.geometry'), { code: '42501' });
    for (let i=0;i<60;i++) await db.query('select public.claim_my_place_request()');
    await assert.rejects(db.query('select public.claim_my_place_request()'), { code: '54000' });
    await asUser(db, second);
    await db.query('select public.claim_my_place_request()');
    await db.exec('reset role;set role service_role');
    await db.query("select public.record_google_place_geometry('ChIJ_place',54,18)");
    await db.query("select public.record_google_place_geometry('ChIJ_place',53,17)");
    await assert.rejects(db.query("select public.record_google_place_geometry('ChIJ_bad',100,18)"), { code: '23514' });
    await db.exec('reset role');
    const result = (await db.query('select *, expires_at<=refreshed_at+interval \'28 days\' as limited from places_private.geometry')).rows;
    assert.equal(result.length, 1);
    assert.equal(result[0].latitude, 53);
    assert.equal(result[0].limited, true);
    assert.deepEqual(Object.keys(result[0]).sort(), ['bounds','expires_at','latitude','limited','longitude','place_id','refreshed_at'].sort());
    await db.query("update places_private.geometry set refreshed_at=now()-interval '29 days',expires_at=now()-interval '1 day'");
    await db.query('select places_private.expire_geometry()');
    assert.equal((await db.query('select count(*)::integer n from places_private.geometry')).rows[0].n, 0);
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.claim_my_place_request()'), { code: '42501' });
    await assert.rejects(db.query('select public.list_my_map_place_refreshes()'), { code: '42501' });
  } finally { await db.close(); }
});
