import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { asUser, profile, trip } from './support/database.mjs';

test('retiring profile preferences clears existing values, neutralizes legacy writes and preserves explicit filters', async () => {
  const db = new PGlite();
  const user = randomUUID(), other = randomUUID();
  const retired = { group_kinds: ['solo'], child_age_bands: ['13–17'], description: 'RETIRED_PRIVATE_PREFERENCE' };
  const call = async (name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
  )).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const directory = new URL('../supabase/migrations/', import.meta.url);
    let original;
    for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
      if (file === '202610310002_remove_profile_preferences.sql') {
        await db.query('insert into auth.users values($1),($2)', [user, other]);
        await asUser(db, user);
        original = await call('save_my_profile', [{ ...profile('Moja ekipa'), matching: retired }]);
        assert.deepEqual(original.preferences.group_kinds, ['solo']);
        await db.exec('reset role');
      }
      await db.exec(await readFile(new URL(file, directory), 'utf8'));
    }
    const empty = { group_kinds: [], child_age_bands: [], description: '' };
    await asUser(db, user);
    const values = (await db.query('select group_kinds,child_age_bands,description from public.group_preferences')).rows;
    assert.deepEqual(values, [empty], 'migration clears stored preferences without changing the group');
    const saved = await call('save_my_profile', [{ ...profile('Moja ekipa'), matching: retired }]);
    assert.equal(saved.group.id, original.group.id);
    assert.deepEqual(saved.preferences, { group_id: saved.group.id, ...empty });
    await db.query('update public.group_preferences set group_kinds=$1,child_age_bands=$2,description=$3',
      [retired.group_kinds, retired.child_age_bands, retired.description]);
    assert.deepEqual((await db.query('select group_kinds,child_age_bands,description from public.group_preferences')).rows, [empty]);
    await asUser(db, other);
    const theirs = await call('save_my_profile', [{ ...profile('Druga ekipa'), matching: retired }]);
    await call('save_my_trip', [trip, null, false]);
    await asUser(db, user);
    const ranked = await call('list_ranked_public_groups_v2', [{}, 'compatibility', null, 5]);
    assert.equal(ranked.items[0].crew.id, theirs.group.id);
    assert.equal(ranked.items[0].recommendation.label, 'shared_interests');
    assert.equal(JSON.stringify(ranked).includes(retired.description), false);
    assert.equal((await call('list_ranked_public_groups_v2', [{ group_kinds: ['solo'] }, 'compatibility', null, 5])).total_count, 0);
    assert.equal((await call('list_ranked_public_groups_v2', [{ child_age_bands: ['4–6'] }, 'compatibility', null, 5])).total_count, 1);
    assert.equal((await call('search_public_trips_v2', [{ group_kinds: ['solo'] }, 'default', null, 5])).total_count, 0);
    assert.equal((await call('search_public_trips_v2', [{ child_age_bands: ['4–6'] }, 'default', null, 5])).total_count, 1);
    await assert.rejects(db.query('select messaging_private.discard_legacy_group_preferences()'), error => error.code === '42501');
    await db.exec('reset role; set role anon');
    await assert.rejects(call('list_ranked_public_groups_v2'), error => error.code === '42501');
  } finally {
    await db.close();
  }
});
