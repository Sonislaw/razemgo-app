import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  return db;
}
export async function asUser(db, user) {
  await db.exec('reset role');
  let session = (
    await db.query('select id from auth.sessions where user_id=$1 limit 1', [
      user,
    ])
  ).rows[0]?.id;
  if (!session) {
    session = randomUUID();
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      user,
    ]);
  }
  await db.exec('set role authenticated');
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",
    [user, session],
  );
}
export const profile = (name) => ({
  name,
  avatar_id: 'trail-fox',
  kind: 'family',
  adult_count: 2,
  child_count: 1,
  child_age_bands: ['4–6'],
  travel_mode: 'Kamper',
  interests: ['Rowery'],
  animal_kinds: [],
  matching: {
    group_kinds: ['family'],
    child_age_bands: ['4–6'],
    description: '',
  },
});
export const trip = {
  mode: 'planned',
  visibility: 'public',
  start_date: '2099-05-21',
  end_date: '2099-05-24',
  location_id: 'pl-locality:4259',
  location_name: 'Chłapowo',
  location_region: 'pomorskie',
  location_kind: 'village',
  campground_name: '',
  campground_address: '',
  description: 'Spokojny wyjazd nad morze, rowery i wspólne ognisko.',
  travel_mode: 'Kamper',
  landscape: 'coast',
  interests: ['Rowery'],
  animal_kinds: [],
  matching_group_kinds: [],
  matching_child_age_bands: [],
};
