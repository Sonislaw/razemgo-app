import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('crew numbers: backfill, immutable server assignment, exact directory search and authorized projections',async t=>{
  const db=new PGlite(),users=[],sessions=[],groups=[],numbers=[];
  const payload={name:'Ta sama ekipa',avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],
    travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}};
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const directory=new URL('../supabase/migrations/',import.meta.url),migration='202610250011_crew_numbers.sql';
    for(const file of(await readdir(directory)).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
    const admin=()=>db.exec('reset role');
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[users[i],sessions[i]]);};
    const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
    const create=async()=>{const i=users.length;users.push(randomUUID());sessions.push(randomUUID());await admin();
      await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],users[i]]);
      await as(i);const saved=await rpc('save_my_profile',[payload]);groups.push(saved.group.id);numbers.push(saved.group.crew_number);return i;};
    for(let i=0;i<4;i++)await create();
    await admin();await db.exec(await readFile(new URL(migration,directory),'utf8'));
    for(let i=0;i<4;i++){await as(i);numbers[i]=(await db.query('select crew_number from public.travel_groups where id=$1',[groups[i]])).rows[0].crew_number;}
    const list=(query,sort='compatibility',cursor=null)=>rpc('list_ranked_public_groups',[{name:query},sort,cursor]);
    const count=query=>rpc('count_public_groups',[{name:query}]);
    await t.test('existing identical profiles and new accounts receive different public numbers',async()=>{
      assert.equal(new Set(numbers).size,4);assert.ok(numbers.every(n=>Number.isInteger(n)&&n>=100000));
      const i=await create();assert.ok(numbers[i]>Math.max(...numbers.slice(0,i)));
      await as(0);const entries=(await list('Ta sama')).items;assert.equal(entries.length,4);
      assert.equal(new Set(entries.map(e=>e.crew.crew_number)).size,4);assert.ok(entries.every(e=>e.crew.owner_user_id===undefined));
    });
    await t.test('name/avatar edits and forged RPC payloads preserve the assigned number',async()=>{
      await as(1);const saved=await rpc('save_my_profile',[{...payload,name:'Łąkowe ścieżki',avatar_id:'trail-fox',crew_number:numbers[2],crewNumber:1}]);
      assert.equal(saved.group.crew_number,numbers[1]);assert.equal(saved.group.id,groups[1]);
      const unchanged=await rpc('save_my_profile',[payload]);assert.equal(unchanged.group.crew_number,numbers[1]);
    });
    await t.test('clients cannot update a number, supply it through overriding inserts, or control the identity sequence',async()=>{
      await as(0);await assert.rejects(db.query('update public.travel_groups set crew_number=$1 where id=$2',[numbers[2],groups[0]]),e=>['42501','428C9'].includes(e.code));
      await assert.rejects(db.query('update public.travel_groups set crew_number=default where id=$1',[groups[0]]),e=>e.code==='42501');
      await assert.rejects(db.query("select nextval('public.travel_groups_crew_number_seq')"),e=>e.code==='42501');
      await assert.rejects(db.query("select setval('public.travel_groups_crew_number_seq',100000)"),e=>e.code==='42501');
      await admin();const newUser=randomUUID();await db.query('insert into auth.users values($1)',[newUser]);
      await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[newUser]);
      await assert.rejects(db.query("insert into public.travel_groups(owner_user_id,crew_number,name,avatar_id,kind,adult_count,child_count,travel_mode) overriding system value values($1,123456,'Forged','camp-bear','couple',2,0,'Kamper')",[newUser]),e=>e.code==='42501');
      await admin();await assert.rejects(db.query('update public.travel_groups set crew_number=default where id=$1',[groups[0]]),e=>e.code==='42501');
    });
    await t.test('all list variants and live count agree on exact numeric search with or without hash',async()=>{
      await as(0);
      for(const query of [String(numbers[1]),'#'+numbers[1],' # '+numbers[1]+' ','#000'+numbers[1]]){
        assert.equal(await count(query),1);
        for(const sort of ['compatibility','alphabetical'])assert.deepEqual((await list(query,sort)).items.map(e=>e.crew.id),[groups[1]]);
        assert.deepEqual((await rpc('list_public_groups',[{name:query}])).items.map(e=>e.crew.id),[groups[1]]);
      }
      for(const query of [String(numbers[1]).slice(0,4),'#abc','#','9'.repeat(70)])assert.equal(await count(query),0);
      assert.equal((await list('#'+numbers[0])).items.length,0);
      assert.equal(await rpc('count_public_groups',[{name:'#'+numbers[1],travel_modes:['Namiot']}]),0);
      assert.equal(await rpc('count_public_groups',[{name:'#'+numbers[1],has_trips:true}]),0);
    });
    await t.test('a known number never bypasses hidden profiles, bilateral blocks, favorites or suspension',async()=>{
      await as(1);await rpc('save_my_group_visibility',[false,'']);await as(0);assert.equal(await count('#'+numbers[1]),0);
      assert.equal((await list('#'+numbers[1])).items.length,0);
      await as(1);await rpc('save_my_group_visibility',[true,'']);
      for(const blocker of [0,1]){await as(blocker);await rpc('set_group_block',[groups[blocker===0?1:0],true]);
        await as(0);assert.equal(await count('#'+numbers[1]),0);assert.equal((await list('#'+numbers[1])).items.length,0);
        await as(blocker);await rpc('set_group_block',[groups[blocker===0?1:0],false]);}
      await as(0);assert.equal(await rpc('count_public_groups',[{name:'#'+numbers[1],favorites_only:true}]),0);
      await rpc('set_my_group_favorite',[groups[1],true]);assert.equal(await rpc('count_public_groups',[{name:'#'+numbers[1],favorites_only:true}]),1);
      await admin();await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);
      await as(0);assert.equal(await count('#'+numbers[1]),0);await admin();await db.query('delete from moderation_private.suspended_accounts where user_id=$1',[users[1]]);
    });
    await t.test('profiles, listings, accepted conversations and reaction notifications expose the same number',async()=>{
      await as(0);assert.equal((await rpc('get_public_group',[groups[1]])).crew.crew_number,numbers[1]);
      const invitation=await rpc('send_profile_invitation',[groups[1],'Cześć!',randomUUID()]);
      await as(1);await rpc('respond_contact_invitation',[invitation,'accepted']);await as(0);
      assert.equal((await rpc('get_my_mailbox')).contacts.find(c=>c.id===groups[1]).crew_number,numbers[1]);
      await as(1);const trip=await rpc('save_my_trip',[{mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
        location_id:'test',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'',campground_address:'',travel_mode:'Kamper',
        description:'Spokojny wyjazd nad morze i wspólne rowery.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]},null,false,randomUUID()]);
      await as(0);const listing=(await db.query('select * from public.list_public_trips($1)',[trip.id])).rows[0];assert.equal(listing.crew.crew_number,numbers[1]);
      await rpc('set_my_trip_reaction',[trip.id,'love']);await as(1);
      assert.equal((await rpc('get_my_trip_reactors',[trip.id])).items[0].crew_number,numbers[0]);
      assert.equal((await rpc('get_my_notifications')).items.find(n=>n.kind==='trip_reaction').actor_crew_number,numbers[0]);
    });
    await t.test('pagination keeps duplicate display names distinct and deleted numbers are never reassigned',async()=>{
      for(let i=0;i<22;i++)await create();await as(0);let cursor=null;const seen=[];
      do{const page=await list('Ta sama','alphabetical',cursor);seen.push(...page.items.map(e=>e.crew.crew_number));cursor=page.has_more?page.cursor:null;}while(cursor);
      assert.equal(seen.length,groups.length-1);assert.equal(new Set(seen).size,seen.length);assert.equal(await count('Ta sama'),seen.length);
      const index=groups.length-1,removed=numbers[index];await admin();await db.query('delete from auth.users where id=$1',[users[index]]);
      const next=await create();assert.notEqual(numbers[next],removed);await as(0);assert.equal(await count('#'+removed),0);
      assert.equal((await db.query('select crew_number from public.travel_groups')).rows.length,1);
      await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(count('#'+numbers[1]),e=>e.code==='42501');await assert.rejects(db.query('select crew_number from public.travel_groups'),e=>e.code==='42501');
    });
  }finally{await db.close();}
});
