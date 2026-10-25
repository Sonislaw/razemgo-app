import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('favorites backend: persistence, privacy, unavailable targets, filtering and deletion', async t => {
  const db = new PGlite(), users = [], groups = [], trips = [];
  const profile = { avatar_id: 'camp-bear', kind: 'couple', adult_count: 2, child_count: 0, child_age_bands: [],
    travel_mode: 'Kamper', interests: ['Rowery'], animal_kinds: [], matching: { group_kinds: [], child_age_bands: [], description: '' } };
  const plan = { mode: 'planned', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24',
    location_id: 'pl-locality:test', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
    campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Wspólny wyjazd nad morze, rowery i ognisko.', landscape: 'coast',
    interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [] };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
    const as = async (i, sid = users[i]) => { await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[i], sid]); };
    const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value;
    const create = async name => { const i = users.length; users.push(randomUUID()); await db.exec('reset role');
      await db.query('insert into auth.users values($1)', [users[i]]); await db.query('insert into auth.sessions(id,user_id) values($1,$1)', [users[i]]);
      await as(i); groups.push((await rpc('save_my_profile', [{ ...profile, name }])).group.id); return i; };
    const favGroup = (i, selected = true) => rpc('set_my_group_favorite', [groups[i], selected]);
    const favTrip = (i, selected = true) => rpc('set_my_trip_favorite', [trips[i], selected]);
    const get = () => rpc('get_my_favorites');
    const count = filters => rpc('count_public_groups', [filters]);
    const list = (filters, sort = 'compatibility', cursor = null) => rpc('list_ranked_public_groups', [filters, sort, cursor]);
    for (const name of ['Owner', 'Bravo', 'Zulu']) { const i = await create(name); trips[i] = (await rpc('save_my_trip', [plan, null, false, randomUUID()])).id; }
    await t.test('desired-state writes are idempotent and independent for profiles and trips, surviving a second session', async () => {
      await as(0); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] });
      assert.equal(await favGroup(1), true); await favGroup(1); await favTrip(1); await favTrip(1);
      assert.deepEqual(await get(), { group_ids: [groups[1]], trip_ids: [trips[1]] });
      const second = randomUUID(); await db.exec('reset role'); await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [second, users[0]]);
      await as(0, second); assert.deepEqual(await get(), { group_ids: [groups[1]], trip_ids: [trips[1]] });
      await as(2); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] }); await favGroup(1, false);
      await as(0); assert.deepEqual(await get(), { group_ids: [groups[1]], trip_ids: [trips[1]] });
      await assert.rejects(favGroup(0), e => e.code === 'P0002'); await assert.rejects(favTrip(0), e => e.code === 'P0002');
      await assert.rejects(rpc('set_my_group_favorite', [randomUUID(), true]), e => e.code === 'P0002');
    });
    await t.test('saved favorites never bypass hidden profiles, paused trips, bilateral blocks or moderation', async () => {
      await as(1); await rpc('save_my_group_visibility', [false, '']);
      await as(0); assert.deepEqual((await get()).group_ids, [groups[1]]); assert.equal(await count({ favorites_only: true }), 0);
      await as(1); await rpc('change_my_trip_status', [trips[1], 'paused']);
      await as(0); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] });
      await assert.rejects(favGroup(1), e => e.code === 'P0002'); await assert.rejects(favTrip(1), e => e.code === 'P0002');
      await as(1); await rpc('save_my_group_visibility', [true, '']); await rpc('change_my_trip_status', [trips[1], 'published']);
      await as(0); await rpc('set_group_block', [groups[1], true]); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] });
      assert.equal(await count({ favorites_only: true }), 0); await rpc('set_group_block', [groups[1], false]);
      await as(1); await rpc('set_group_block', [groups[0], true]);
      await as(0); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] });
      await as(1); await rpc('set_group_block', [groups[0], false]);
      await db.exec('reset role'); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[1]]);
      await as(0); assert.deepEqual(await get(), { group_ids: [], trip_ids: [] });
      await db.exec('reset role'); await db.query('delete from moderation_private.suspended_accounts where user_id=$1', [users[1]]);
      await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)', [trips[1]]);
      await as(0); assert.deepEqual((await get()).trip_ids, []); assert.deepEqual((await get()).group_ids, [groups[1]]);
      assert.equal(await favTrip(1, false), false); assert.equal(await favTrip(1, false), false);
      await db.exec('reset role'); await db.query('delete from moderation_private.hidden_trips where trip_id=$1', [trips[1]]);
    });
    await t.test('favorites filter is evaluated before pagination, with full counts and both sort modes', async () => {
      for (let i = 0; i < 24; i++) await create('AAA crew ' + String(i).padStart(2, '0'));
      await as(0); await favGroup(1, false); await favGroup(2);
      assert.equal((await list({})).items.some(x => x.crew.id === groups[2]), false);
      for (const sort of ['compatibility', 'alphabetical']) assert.deepEqual((await list({ favorites_only: true }, sort)).items.map(x => x.crew.id), [groups[2]]);
      assert.equal(await count({ favorites_only: true }), 1);
      for (let i = 3; i < groups.length; i++) await favGroup(i);
      for (const sort of ['compatibility', 'alphabetical']) {
        let page = await list({ favorites_only: true }, sort); assert.equal(page.items.length, 20); const ids = page.items.map(x => x.crew.id);
        while (page.has_more) { page = await list({ favorites_only: true }, sort, page.cursor); ids.push(...page.items.map(x => x.crew.id)); }
        assert.equal(new Set(ids).size, 25); assert.equal(await count({ favorites_only: true }), ids.length);
      }
      assert.equal(await count({ favorites_only: true, online_only: true }), 0);
      assert.equal(await count({ favorites_only: true, group_kinds: ['family'] }), 0);
      assert.equal(await count({ favorites_only: true, name: 'Zulu' }), 1);
    });
    await t.test('private tables and helpers are inaccessible; owner/session/boolean validation cannot be bypassed', async () => {
      await as(0); await assert.rejects(db.query('select * from favorites_private.group_favorites'));
      await assert.rejects(db.query('insert into favorites_private.trip_favorites values($1,$2,now())', [groups[0], trips[1]]));
      await assert.rejects(db.query('select favorites_private.can_view_group($1,$2)', [groups[0], groups[1]]));
      for (const bad of ['true', null, 1, {}, []]) {
        await assert.rejects(count({ favorites_only: bad }), e => e.code === '22023');
        await assert.rejects(list({ favorites_only: bad }), e => e.code === '22023');
        await assert.rejects(rpc('list_public_groups', [{ favorites_only: bad }]), e => e.code === '22023');
      }
      await as(0, users[1]); await assert.rejects(get(), e => e.code === '42501'); await assert.rejects(favGroup(1), e => e.code === '42501');
      await assert.rejects(count({ favorites_only: true }), e => e.code === '42501');
      await db.exec('reset role'); await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [users[0]]);
      await as(0); await assert.rejects(get(), e => e.code === '42501');
      await db.exec('reset role'); await db.query('update auth.sessions set not_after=null where id=$1', [users[0]]);
      await db.exec('set role anon'); await assert.rejects(get()); await assert.rejects(favGroup(1)); await assert.rejects(favTrip(1));
    });
    await t.test('deleting a saved target and the owner cascades favorites without retaining a public snapshot', async () => {
      await as(0); await favTrip(2);
      await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[2]]);
      await as(0); assert.equal((await get()).group_ids.includes(groups[2]), false); assert.equal((await get()).trip_ids.includes(trips[2]), false);
      await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[0]]);
      assert.equal((await db.query('select count(*)::int as n from favorites_private.group_favorites')).rows[0].n, 0);
      assert.equal((await db.query('select count(*)::int as n from favorites_private.trip_favorites')).rows[0].n, 0);
    });
  } finally { await db.close(); }
});
