import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('crew trip pages use bounded SQL, stable cursors and the existing profile/trip permissions',async t=>{
  const db=new PGlite(),users=Array.from({length:3},randomUUID),groups=[],trips=[];
  const profile={name:'Ekipa kontrolna',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:['dog'],matching:{group_kinds:['family'],child_age_bands:[],description:'PRIVATE_SENTINEL'}};
  const base={mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i ognisko.',landscape:'coast',interests:['Rowery'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]};
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    const root=()=>db.exec('reset role');
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$1,false)",[users[i]]);};
    const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
    for(let i=0;i<users.length;i++){
      await root();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[users[i]]);
      await as(i);groups.push((await rpc('save_my_profile',[{...profile,name:'Ekipa '+i}])).group.id);
    }
    for(let i=0;i<26;i++){
      await as(i===25?2:1);trips.push(await rpc('save_my_trip',[base,null,false,randomUUID()]));
    }
    await root();await db.exec("alter table public.trip_plans disable trigger user;update public.trip_plans set published_at='2026-10-26T10:00:00Z';alter table public.trip_plans enable trigger user");await as(0);
    const page=(cursor=null,size=5,target=groups[1])=>rpc('get_public_group',[target,cursor,size]);
    await t.test('5/10/15/20/25 cards cover one crew only, even with tied publication dates',async()=>{
      let result=await page();const ids=[];
      do{
        assert.equal(result.active_trip_count,25);assert.equal(result.trips.length,5);
        assert.ok(result.trips.every(item=>item.crew.id===groups[1]&&item.crew.crew_number));
        assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'),false);
        assert.equal(result.crew.owner_user_id,undefined);assert.equal(result.trips[0].trip.create_key,undefined);
        ids.push(...result.trips.map(item=>item.trip.id));
        if(!result.has_more)break;result=await page(result.cursor);
      }while(true);
      assert.equal(ids.length,25);assert.deepEqual(ids,[...new Set(ids)].sort());
      assert.equal((await rpc('get_public_group',[groups[1]])).trips.length,25);
      assert.equal((await page(null,20)).trips.length,20);
    });
    await t.test('invalid sizes and cursors are rejected; a deleted cursor row does not restart the list',async()=>{
      for(const size of [0,21,-1,null])await assert.rejects(page(null,size),e=>e.code==='22023');
      const first=await page(),cursor=first.cursor;
      for(const invalid of [{},{...cursor,id:'invalid'},{...cursor,published_at:'infinity'},{...cursor,query_key:'other'}])
        await assert.rejects(page(invalid),e=>e.code==='22023');
      await assert.rejects(page(cursor,5,groups[2]),e=>e.code==='22023');
      await as(2);await assert.rejects(page(cursor),e=>e.code==='22023');
      await root();await db.query('delete from public.trip_plans where id=$1',[cursor.id]);await as(0);
      const next=await page(cursor);assert.equal(next.active_trip_count,24);
      assert.ok(next.trips.every(item=>item.trip.id>cursor.id));
    });
    await t.test('private, paused, completed, cancelled, draft, past and moderated trips are absent from cards and count',async()=>{
      await root();await db.exec('alter table public.trip_plans disable trigger user');
      const live=(await db.query('select id from public.trip_plans where group_id=$1 order by id',[groups[1]])).rows;
      for(const [i,status] of ['paused','completed','cancelled','draft'].entries())await db.query('update public.trip_plans set status=$1 where id=$2',[status,live[i].id]);
      await db.query("update public.trip_plans set visibility='private',status='paused' where id=$1",[live[4].id]);
      await db.query("update public.trip_plans set start_date='2020-01-01',end_date='2020-01-03' where id=$1",[live[5].id]);
      await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)',[live[6].id]);
      await db.exec('alter table public.trip_plans enable trigger user');
      await as(0);const result=await page(null,20);assert.equal(result.active_trip_count,17);assert.equal(result.trips.length,17);
      assert.equal(result.has_more,false);assert.ok(result.trips.every(item=>!live.slice(0,7).some(row=>row.id===item.trip.id)));
    });
    await t.test('blocks, hidden profiles, suspended accounts and anonymous access never bypass visibility',async()=>{
      await as(0);const first=await page();await rpc('set_group_block',[groups[1],true]);assert.equal(await page(first.cursor),null);
      await rpc('set_group_block',[groups[1],false]);await as(1);await rpc('set_group_block',[groups[0],true]);await as(0);assert.equal(await page(),null);
      await as(1);await rpc('set_group_block',[groups[0],false]);await rpc('save_my_group_visibility',[false,'']);
      await as(0);assert.ok(await page()); // A public trip still permits the profile.
      await root();await db.query("update public.trip_plans set status='paused' where group_id=$1 and status='published' and end_date>current_date",[groups[1]]);
      await as(0);assert.equal(await page(),null);assert.equal(await page(null,5,groups[0]),null);
      await as(1);await rpc('save_my_group_visibility',[true,'']);await as(0);const empty=await page();assert.equal(empty.trips.length,0);assert.equal(empty.active_trip_count,0);
      await root();await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);
      await as(0);assert.equal(await page(),null);
      await root();await db.query('delete from moderation_private.suspended_accounts where user_id=$1',[users[1]]);
      await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[0]]);
      await as(0);await assert.rejects(page(),e=>e.code==='42501');
      await root();await db.query('delete from moderation_private.suspended_accounts where user_id=$1',[users[0]]);
      await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[users[0]]);
      await as(0);await assert.rejects(page(),e=>e.code==='42501');
      await root();await db.exec('set role anon');await assert.rejects(page(),e=>e.code==='42501');
    });
  }finally{await db.close();}
});
