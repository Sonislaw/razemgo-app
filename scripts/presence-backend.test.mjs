import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('presence backend: sessions, privacy, expiry, blocks and account isolation', async t => {
  const db = new PGlite(); const users = [randomUUID(), randomUUID(), randomUUID()], sessions = users.map(() => randomUUID()), groups = [];
  const connections = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users on delete cascade, not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, dir), 'utf8'));
    const as = async (i, sid = sessions[i]) => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[i], sid]);
    };
    const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value;
    const beat = (connection = connections[0], online = true) => rpc('set_my_presence', [connection, online]);
    const lookup = (ids = groups) => rpc('get_online_groups', [ids]);
    for (let i = 0; i < users.length; i++) {
      await db.exec('reset role');
      await db.query('insert into auth.users values ($1)', [users[i]]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[i], users[i]]);
      await as(i);
      const saved = await rpc('save_my_profile', [{ name: 'Presence QA ' + i, avatar_id: 'camp-bear', kind: 'couple', adult_count: 2,
        child_count: 0, child_age_bands: [], travel_mode: 'Kamper', interests: [], animal_kinds: [], matching: { group_kinds: [], child_age_bands: [], description: '' } }]);
      groups.push(saved.group.id);
    }
    await t.test('only the caller becomes online; duplicate heartbeats and late heartbeats after leaving are safe', async () => {
      await as(1); await beat(); await beat();
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
      await as(1); await beat(connections[0], false); await beat();
      await as(0); assert.deepEqual(await lookup(), []);
      await as(1); await beat(connections[1]);
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
    });
    await t.test('multiple devices/tabs: one leaving keeps the other online; revoked/expired sessions stop counting', async () => {
      const second = randomUUID(); await db.exec('reset role');
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [second, users[1]]);
      await as(1, second); await beat(connections[2]);
      await as(1); await beat(connections[1], false);
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
      await db.exec('reset role'); await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [second]);
      await as(0); assert.deepEqual(await lookup(), []);
      await as(1, second); await assert.rejects(beat(), e => e.code === '42501');
      await db.exec('reset role'); await db.query('update auth.sessions set not_after=null where id=$1', [second]);
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
      await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1', [second]);
      await as(0); assert.deepEqual(await lookup(), []);
    });
    await t.test('foreground timeout removes stale dots without a leave request or a trusted client clock', async () => {
      await as(1); await beat(randomUUID());
      await db.exec('reset role'); await db.query("update presence_private.connections set updated_at=now()-interval '76 seconds' where group_id=$1", [groups[1]]);
      await as(0); assert.deepEqual(await lookup(), []);
      await as(1); await beat(randomUUID());
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
    });
    await t.test('hidden crews stay private; existing invitations may see activity; blocks work in both directions', async () => {
      await as(1); await rpc('save_my_group_visibility', [false, '']);
      await as(0); assert.deepEqual(await lookup(), []);
      await as(1); await rpc('save_my_group_visibility', [true, '']);
      await as(0); await rpc('send_profile_invitation', [groups[1], 'Hello from presence test', randomUUID()]);
      await as(1); await rpc('save_my_group_visibility', [false, '']);
      await as(0); assert.deepEqual(await lookup(), [groups[1]]);
      await rpc('set_group_block', [groups[1], true]); assert.deepEqual(await lookup(), []);
      await rpc('set_group_block', [groups[1], false]);
      await as(1); await rpc('set_group_block', [groups[0], true]);
      await as(0); assert.deepEqual(await lookup(), []);
      await as(1); await rpc('set_group_block', [groups[0], false]);
      await rpc('save_my_group_visibility', [true, '']);
    });
    await t.test('online directory pages and counts share presence semantics, all other filters and access restrictions', async () => {
      const ranked = filters => rpc('list_ranked_public_groups', [filters]);
      const legacy = filters => rpc('list_public_groups', [filters]);
      const count = filters => rpc('count_public_groups', [filters]);
      await as(0);
      assert.equal((await ranked({})).items.length, 2);
      for (const list of [ranked, legacy]) {
        assert.deepEqual((await list({ online_only: true })).items.map(x => x.crew.id), [groups[1]]);
        assert.equal((await list({ online_only: true, group_kinds: ['family'] })).items.length, 0);
        assert.equal((await list({ online_only: true, has_trips: true })).items.length, 0);
      }
      assert.equal(await count({ online_only: true }), 1);
      assert.equal(await count({ online_only: true, name: 'missing' }), 0);
      assert.equal(await count({ online_only: true, group_kinds: ['family'] }), 0);
      for (const endpoint of [ranked, legacy, count]) {
        for (const bad of ['true', 1, null, [], {}]) await assert.rejects(endpoint({ online_only: bad }), e => e.code === '22023');
      }
      await as(0, sessions[1]);
      for (const endpoint of [ranked, legacy, count]) await assert.rejects(endpoint({ online_only: true }), e => e.code === '42501');
      await as(0); await rpc('send_profile_invitation', [groups[1], 'Presence filter contact', randomUUID()]);
      await as(1); await rpc('save_my_group_visibility', [false, '']);
      await as(0); assert.ok((await lookup()).includes(groups[1])); // Existing contact can still see the dot.
      assert.equal(await count({ online_only: true }), 0); // A hidden profile never enters the directory.
      assert.equal((await ranked({ online_only: true })).items.length, 0);
      await as(1); await rpc('save_my_group_visibility', [true, '']);
      await as(0); await rpc('set_group_block', [groups[1], true]);
      assert.equal(await count({ online_only: true }), 0);
      assert.equal((await ranked({ online_only: true })).items.length, 0);
      await rpc('set_group_block', [groups[1], false]);
      await as(1); await rpc('set_group_block', [groups[0], true]);
      await as(0); assert.equal(await count({ online_only: true }), 0);
      await as(1); await rpc('set_group_block', [groups[0], false]);
      await db.exec('reset role');
      await db.query("update presence_private.connections set updated_at=now()-interval '76 seconds' where group_id=$1", [groups[1]]);
      await as(0); assert.equal(await count({ online_only: true }), 0);
      assert.equal((await ranked({ online_only: true })).items.length, 0);
      await as(1); await beat(randomUUID());
      await as(0); assert.equal(await count({ online_only: true }), 1);
      await assert.rejects(db.query('select presence_private.group_is_online($1)', [groups[1]]));
    });
    await t.test('anonymous, forged sessions, suspended users and direct private table access are denied', async () => {
      await as(0, sessions[1]); await assert.rejects(beat(), e => e.code === '42501');
      await assert.rejects(lookup(), e => e.code === '42501');
      await as(0); await assert.rejects(db.query('select * from presence_private.connections'));
      await assert.rejects(lookup(null), e => e.code === '22023');
      await assert.rejects(lookup(Array(101).fill(groups[1])), e => e.code === '22023');
      await assert.rejects(lookup([null]), e => e.code === '22023');
      assert.deepEqual(await lookup([]), []);
      await db.exec('reset role'); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[1]]);
      await as(0); assert.deepEqual(await lookup(), []);
      assert.equal(await rpc('count_public_groups', [{ online_only: true }]), 0);
      assert.equal((await rpc('list_ranked_public_groups', [{ online_only: true }])).items.length, 0);
      await as(1); await assert.rejects(beat(), e => e.code === '42501');
      await assert.rejects(lookup(), e => e.code === '42501');
      await db.exec('reset role; set role anon'); await assert.rejects(lookup()); await assert.rejects(beat());
    });
    await t.test('deleting the account cascades through connections', async () => {
      await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[1]]);
      assert.equal((await db.query('select count(*)::int as n from presence_private.connections')).rows[0].n, 0);
    });
  } finally { await db.close(); }
});
