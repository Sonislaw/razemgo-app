import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {testDatabase} from './support/database.mjs';

test('provider cache: atomic ownership, fencing, expiry, cooldown, component lifetimes and private access', async t => {
  const db = await testDatabase();
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const server = () => db.exec('reset role;set role service_role');
  const claim = (key, id = randomUUID()) => rpc('claim_api_cache_refresh', [key, id]);
  try {
    await server();
    await t.test('20 competing claims have exactly one owner', async () => {
      const key = 'places:geometry:ChIJ_race', ids = Array.from({length: 20}, () => randomUUID());
      const claims = await Promise.all(ids.map(id => claim(key, id)));
      assert.equal(claims.filter(value => value.state === 'acquired').length, 1);
      assert.equal(claims.filter(value => value.state === 'busy').length, 19);
      const owner = ids[claims.findIndex(value => value.state === 'acquired')];
      await rpc('release_api_cache_refresh', [key, randomUUID(), false]);
      assert.equal((await claim(key)).state, 'busy');
      assert.equal(await rpc('commit_api_cache_refresh', [key, randomUUID(), {placeId: 'ChIJ_race', latitude: 1, longitude: 2}]), false);
      assert.equal(await rpc('commit_api_cache_refresh', [key, owner, {placeId: 'ChIJ_race', latitude: 54, longitude: 18}]), true);
      assert.equal((await rpc('get_google_place_geometry', ['ChIJ_race'])).latitude, 54);
    });
    await t.test('expired worker cannot overwrite a replacement or release its lock', async () => {
      const key = 'places:geometry:ChIJ_expired', old = randomUUID(), next = randomUUID();
      await claim(key, old); await db.exec('reset role');
      await db.query("update api_cache_private.refresh_leases set expires_at=clock_timestamp()-interval '1 second' where key=$1", [key]);
      await server(); assert.equal((await claim(key, next)).state, 'acquired');
      assert.equal(await rpc('commit_api_cache_refresh', [key, old, {placeId: 'ChIJ_expired', latitude: 1, longitude: 2}]), false);
      await rpc('release_api_cache_refresh', [key, old, false]); assert.equal((await claim(key)).state, 'busy');
      assert.equal(await rpc('commit_api_cache_refresh', [key, next, {placeId: 'ChIJ_expired', latitude: 54, longitude: 18}]), true);
    });
    await t.test('a provider error puts all followers into a cooldown', async () => {
      const key = 'weather:forecast:failed', owner = randomUUID(); await claim(key, owner);
      await rpc('release_api_cache_refresh', [key, owner, true]);
      assert.equal((await claim(key)).state, 'cooldown');
    });
    await t.test('forecasts last 60 minutes; alerts last 10; both expire independently', async () => {
      for (const component of ['forecast', 'alerts']) {
        const key = 'weather:' + component + ':point:pl:v2', owner = randomUUID();
        const payload = component === 'forecast' ? {days: [], timeZone: 'Europe/Warsaw', fetchedAt: new Date().toISOString()} : {alerts: [], fetchedAt: new Date().toISOString()};
        await claim(key, owner); assert.equal(await rpc('commit_api_cache_refresh', [key, owner, payload]), true);
        assert.deepEqual(await rpc('get_weather_component', ['point:pl:v2', component]), payload);
      }
      await db.exec('reset role');
      const rows = (await db.query('select component,extract(epoch from expires_at-now())::int seconds from weather_private.components order by component')).rows;
      assert(rows[0].seconds > 590 && rows[0].seconds <= 600); assert(rows[1].seconds > 3590 && rows[1].seconds <= 3600);
      await db.query("update weather_private.components set expires_at=now()-interval '1 second' where component='alerts'");
      await server(); assert.equal(await rpc('get_weather_component', ['point:pl:v2', 'alerts']), null);
      assert(await rpc('get_weather_component', ['point:pl:v2', 'forecast']));
    });
    await t.test('client roles cannot read data, acquire locks, commit or release refreshes', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec('reset role;set role ' + role);
        for (const [name, args] of [['claim_api_cache_refresh', ['places:geometry:ChIJ_test', randomUUID()]],
          ['release_api_cache_refresh', ['places:geometry:ChIJ_test', randomUUID(), false]],
          ['commit_api_cache_refresh', ['places:geometry:ChIJ_test', randomUUID(), {}]], ['get_weather_component', ['point:pl:v2', 'forecast']]])
          await assert.rejects(rpc(name, args), {code: '42501'});
        await assert.rejects(db.query('select * from api_cache_private.refresh_leases'), {code: '42501'});
      }
    });
  } finally {await db.close();}
});
