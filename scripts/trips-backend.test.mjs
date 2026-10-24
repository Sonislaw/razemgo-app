import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const profile = {
  name: 'Ekipa', avatar_id: 'trail-fox', kind: 'family', adult_count: 2, child_count: 1,
  child_age_bands: ['4–6'], travel_mode: 'Kamper', interests: ['Rowery'], animal_kinds: ['dog'],
  matching: { group_kinds: ['family'], child_age_bands: ['4–6'], description: 'Prywatne preferencje' },
};
const plan = {
  mode: 'planned', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24',
  location_id: 'pl-locality:test', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
  campground_name: 'Pod Wydmami', campground_address: 'Leśna 1', travel_mode: 'Kamper',
  description: 'Spokojny wyjazd nad morze, rowery i ognisko.', landscape: 'coast',
  interests: ['Rowery'], animal_kinds: ['dog'], matching_group_kinds: ['family'], matching_child_age_bands: ['4–6'],
};
test('trips migration enforces ownership, publication, lifecycle and a safe discovery projection', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('${A}'),('${B}');`);
    await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated;');
    for (const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    const as = id => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const save = async (value = plan, id = null, draft = false, key = null) =>
      (await one('select public.save_my_trip($1::jsonb,$2::uuid,$3,$4::uuid) as value', [JSON.stringify(value),id,draft,key])).value;
    const list = async (id = null) => (await db.query('select * from public.list_public_trips($1::uuid)', [id])).rows;
    const status = async (id,value) => (await one('select public.change_my_trip_status($1,$2) as value',[id,value])).value;
    await as(A);
    const groupA = (await one('select public.save_my_profile($1) as value',[JSON.stringify(profile)])).value.group.id;
    await as(B);
    const groupB = (await one('select public.save_my_profile($1) as value',[JSON.stringify({...profile,name:'Ekipa B'})])).value.group.id;
    await as(A);
    const requestKey = '00000000-0000-4000-8000-000000000333';
    const publicTrip = await save({...plan, group_id:groupB, published_at:'2000-01-01'}, null, false, requestKey);
    const draft = await save({mode:'planned',visibility:'private',landscape:'forest'},null,true);
    const privateTrip = await save({...plan,visibility:'private'});
    await t.test('ids, group ownership and publication time come from the server; incomplete drafts are stored', async()=>{
      assert.match(publicTrip.id,/^[0-9a-f-]{36}$/);
      assert.equal(publicTrip.group_id,groupA);
      assert.notEqual(publicTrip.published_at,'2000-01-01');
      assert.equal(draft.status,'draft');assert.equal(draft.start_date,null);
      assert.equal(privateTrip.status,'paused');assert.equal(privateTrip.published_at,null);
      assert.equal((await db.query('select id from public.trip_plans')).rows.length,3);
      assert.equal((await list()).length,0);
    });
    await t.test('retrying creation after a lost response updates one plan instead of creating a duplicate', async()=>{
      const again = await save(plan, null, false, requestKey);
      assert.equal(again.id, publicTrip.id);
      assert.equal(again.published_at, publicTrip.published_at);
      assert.equal((await db.query('select id from public.trip_plans')).rows.length,3);
    });
    await t.test('database rejects invalid direct or RPC writes and rolls back partial inserts', async()=>{
      for(const patch of [
        {description:'  a   b  '},{start_date:'2099-02-30'},{end_date:'2099-05-21'},
        {location_kind:'region'},{location_name:''},{travel_mode:'Motor'},{landscape:'unknown'},
        {animal_kinds:['other']},{animal_kinds:['dog','dog']},{matching_group_kinds:['unknown']},
      ]) await assert.rejects(save({...plan,...patch}));
      assert.equal((await db.query('select id from public.trip_plans')).rows.length,3);
      await assert.rejects(db.query("update public.trip_plans set description='x' where id=$1",[publicTrip.id]));
      await assert.rejects(db.query('update public.trip_plans set group_id=$1 where id=$2',[groupB,publicTrip.id]));
      await assert.rejects(db.query("update public.trip_plans set id=$1 where id=$2",[B,publicTrip.id]));
      assert.equal((await one('select description from public.trip_plans where id=$1',[publicTrip.id])).description,plan.description);
    });
    await as(B);
    await t.test('a second account sees only published public plans through the explicit projection', async()=>{
      assert.deepEqual((await db.query('select * from public.trip_plans')).rows,[]);
      const rows=await list();assert.equal(rows.length,1);assert.equal(rows[0].trip.id,publicTrip.id);
      assert.equal(rows[0].crew.name,profile.name);
      assert.equal(rows[0].crew.owner_user_id,undefined);
      assert.equal(rows[0].crew.matching,undefined);
      assert.equal(rows[0].crew.email,undefined);
      assert.equal(rows[0].trip.create_key,undefined);
      assert.equal(JSON.stringify(rows).includes('Prywatne preferencje'),false);
      assert.equal((await list(draft.id)).length,0);
      assert.equal((await list(privateTrip.id)).length,0);
      assert.equal((await list(publicTrip.id)).length,1);
      assert.equal((await db.query('select * from public.travel_groups')).rows.length,1);
    });
    await t.test('another account cannot edit, resume, duplicate, delete, or transfer someone else’s plan', async()=>{
      await assert.rejects(save({...plan,description:'Próba cudzej edycji wyjazdu.'},publicTrip.id));
      await assert.rejects(status(publicTrip.id,'paused'));
      await assert.rejects(db.query('select public.duplicate_my_trip($1)',[publicTrip.id]));
      await assert.rejects(db.query('select public.delete_my_trip($1)',[publicTrip.id]));
      assert.deepEqual((await db.query("update public.trip_plans set status='paused' where id=$1 returning id",[publicTrip.id])).rows,[]);
      await assert.rejects(db.query("insert into public.trip_plans(group_id,mode,landscape) values($1,'planned','coast')",[groupA]));
    });
    await as(A);await status(publicTrip.id,'paused');
    await as(B);assert.equal((await list()).length,0);
    await as(A);
    await t.test('pause, edit and resume preserve publication time; publication of a private plan is explicit', async()=>{
      const edited=await save({...plan,description:'Nowy opis po edycji, spokojny wyjazd nad morze.'},publicTrip.id);
      assert.equal(edited.status,'paused');assert.equal(edited.published_at,publicTrip.published_at);
      const resumed=await status(publicTrip.id,'published');
      assert.equal(resumed.published_at,publicTrip.published_at);
      const opened=await status(privateTrip.id,'published');
      assert.equal(opened.visibility,'public');assert.ok(opened.published_at);
      await assert.rejects(save(plan,publicTrip.id,true));
    });
    await t.test('duplicates have new ids, no publication timestamp, and private draft visibility', async()=>{
      const copied=(await one('select public.duplicate_my_trip($1) as value',[publicTrip.id])).value;
      assert.notEqual(copied.id,publicTrip.id);assert.equal(copied.status,'draft');
      assert.equal(copied.visibility,'private');assert.equal(copied.published_at,null);
      assert.equal(copied.campground_name,plan.campground_name);
      await db.query('select public.delete_my_trip($1)',[copied.id]);
      assert.equal((await db.query('select id from public.trip_plans where id=$1',[copied.id])).rows.length,0);
    });
    await t.test('flexible plans cannot retain a hidden campground and broad planned destinations cannot publish',async()=>{
      const flexible=await save({...plan,mode:'flexible',location_kind:'region',location_name:'Mazury'});
      assert.equal(flexible.campground_name,'');assert.equal(flexible.campground_address,'');
      await assert.rejects(db.query("update public.trip_plans set campground_name='Hidden' where id=$1",[flexible.id]));
      await status(flexible.id,'cancelled');
      await assert.rejects(status(flexible.id,'published'));
      await status(publicTrip.id,'completed');
      await assert.rejects(status(publicTrip.id,'published'));
      await assert.rejects(db.query("update public.trip_plans set status='draft' where id=$1",[publicTrip.id]));
    });
    await db.exec('reset role; set role anon;');
    await t.test('anonymous requests cannot access rows or discovery RPCs',async()=>{
      assert.equal((await one("select has_function_privilege('anon','public.list_public_trips(uuid)','EXECUTE') as allowed")).allowed,false);
      await assert.rejects(db.query('select * from public.trip_plans'));
      await assert.rejects(list());
      await assert.rejects(save());
    });
    await db.exec('reset role;');
    await db.query('delete from auth.users where id=$1',[A]);
    await t.test('account deletion cascades to all plans and stale account credentials expose no discovery',async()=>{
      assert.equal((await db.query('select * from public.trip_plans where group_id=$1',[groupA])).rows.length,0);
      await as(A);assert.equal((await list()).length,0);await assert.rejects(save());
    });
  } finally { await db.close(); }
});
