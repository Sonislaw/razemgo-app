import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { groupCompatibility } from '../src/features/groups/group-compatibility.ts';
import { profileFromRows } from '../src/features/profile/profile-mapper.ts';

test('profile ranking: server parity, bilateral private preferences, global pagination and access', async t => {
  const db = new PGlite(); const users = [], profiles = [];
  const base = { name: 'Viewer', avatar_id: 'camp-bear', kind: 'family', adult_count: 2, child_count: 1,
    child_age_bands: ['4–6'], travel_mode: 'Kamper', interests: ['Rowery','Ognisko'], animal_kinds: [],
    matching: { group_kinds: ['family'], child_age_bands: ['4–6'], description: 'PRIVATE_DESCRIPTION_SENTINEL' } };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir = new URL('../supabase/migrations/',import.meta.url);
    for (const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
    const as = async index => { await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$1,false)",[users[index]]); };
    const rpc = async (name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
    const save = async(index,payload) => { await as(index); const saved=await rpc('save_my_profile',[payload]); profiles[index]=saved; return saved; };
    const create = async payload => { const index=users.length; users.push(randomUUID()); await db.exec('reset role'); await db.query('insert into auth.users values($1)',[users[index]]); await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[users[index]]); await save(index,payload); return index; };
    const detail = index => rpc('get_public_group',[profiles[index].group.id]);
    const list = (filters={},sort='compatibility',cursor=null) => rpc('list_ranked_public_groups',[filters,sort,cursor]);
    const count = (filters={}) => rpc('count_public_groups',[filters]);
    await create(base); await create({...base,name:'Zeta best match'});
    await t.test('SQL and local model agree for matches, both preference directions and missing data', async()=>{
      const cases = [
        base,
        {...base,matching:{...base.matching,group_kinds:['couple']}},
        {...base,matching:{...base.matching,child_age_bands:['13–17']}},
        {...base,interests:['Rowery','Fotografia']},
        {...base,interests:[]},
        {...base,child_age_bands:[]},
        {...base,child_count:0,child_age_bands:[]},
        {...base,kind:'friends',travel_mode:'Namiot',child_age_bands:['13–17'],interests:['Kajaki'],matching:{...base.matching,group_kinds:['solo'],child_age_bands:['13–17']}},
      ];
      for (const payload of cases) {
        await save(1,{...payload,name:'Zeta best match'}); await as(0);
        const result=(await detail(1)).compatibility;
        const expected=groupCompatibility(profileFromRows(profiles[0].group,profiles[0].preferences),profileFromRows(profiles[1].group,profiles[1].preferences));
        assert.deepEqual(result,{score:expected.score,reasons:expected.reasons,limited_data:expected.limitedData,evaluated_weight:expected.evaluatedWeight});
        await as(1); assert.deepEqual((await detail(0)).compatibility,result);
      }
      await save(1,{...base,name:'Zeta best match'});
    });
    await t.test('animals do not affect the score and returned data never includes private preference arrays or descriptions',async()=>{
      await as(0); const before=(await detail(1)).compatibility;
      await save(1,{...base,name:'Zeta best match',animal_kinds:['dog']}); await as(0);
      assert.deepEqual((await detail(1)).compatibility,before);
      const result=await list(); assert.equal(JSON.stringify(result).includes('PRIVATE_DESCRIPTION_SENTINEL'),false);
      assert.equal(result.items[0].crew.owner_user_id,undefined); assert.equal(result.items[0].preferences,undefined);
      await assert.rejects(db.query('select messaging_private.group_compatibility(a,b) from public.travel_groups a cross join public.travel_groups b'));
      assert.equal((await db.query('select * from public.group_preferences')).rows.length,1);
    });
    await t.test('empty profiles do not get an invented score and genuine zero remains ranked above missing data',async()=>{
      await create({...base,name:'AAA insufficient',interests:[],matching:{group_kinds:[],child_age_bands:[],description:''}});
      await save(0,{...base,interests:[],matching:{group_kinds:[],child_age_bands:[],description:''}});
      await as(0); assert.equal((await detail(2)).compatibility.score,null);
      await save(0,base);
      await save(2,{...base,name:'AAA zero',kind:'friends',travel_mode:'Namiot',child_age_bands:['13–17'],interests:['Kajaki'],matching:{...base.matching,group_kinds:['solo'],child_age_bands:['13–17']}});
      await create({...base,name:'AAA missing ages',interests:[],child_age_bands:[],matching:{group_kinds:[],child_age_bands:[],description:''}});
      await as(0); const page=await list();
      assert.equal(page.items[0].compatibility.score,100);
      assert.equal(page.items[1].compatibility.score,0);
      assert.equal(page.items[2].compatibility.score,null);
    });
    await t.test('ranking happens before the 20-result limit and stable cursors cover scored and unscored ties',async()=>{
      for(let i=0;i<23;i++) await create({...base,name:'Alphabetical first '+String(i).padStart(2,'0'),travel_mode:'Namiot'});
      await as(0); const first=await list(); assert.equal(first.items.length,20); assert.equal(first.has_more,true);
      assert.equal(first.items[0].crew.id,profiles[1].group.id); assert.equal(first.items[0].compatibility.score,100);
      const seen=[...first.items]; let page=first;
      while(page.has_more){page=await list({},'compatibility',page.cursor);seen.push(...page.items);}
      assert.equal(seen.length,users.length-1); assert.equal(new Set(seen.map(g=>g.crew.id)).size,seen.length);
      assert.equal(await count(),seen.length); assert.ok(await count()>20);
      const scores=seen.map(x=>x.compatibility.score??-1); assert.deepEqual(scores,[...scores].sort((a,b)=>b-a));
      const alpha=await list({},'alphabetical'); assert.notEqual(alpha.items[0].crew.id,profiles[1].group.id);
      const next=await list({},'alphabetical',alpha.cursor); assert.equal(new Set([...alpha.items,...next.items].map(g=>g.crew.id)).size,users.length-1);
      const filtered=await list({name:'Zeta',group_kinds:['family'],animal_kinds:['dog']}); assert.equal(filtered.items.length,1);
      assert.equal(await count({name:'Zeta',group_kinds:['family'],animal_kinds:['dog']}),1);
    });
    await t.test('online filtering runs before pagination and both sort modes agree with the full online count', async () => {
      await as(25); await rpc('set_my_presence', [randomUUID(), true]);
      await as(0);
      for (const sort of ['compatibility', 'alphabetical']) {
        const only = await list({ online_only: true }, sort);
        assert.deepEqual(only.items.map(item => item.crew.id), [profiles[25].group.id]);
      }
      assert.equal(await count({ online_only: true }), 1);
      for (let i = 0; i < users.length; i++) { await as(i); await rpc('set_my_presence', [randomUUID(), true]); }
      await as(0);
      for (const sort of ['compatibility', 'alphabetical']) {
        let page = await list({ online_only: true }, sort); assert.equal(page.items.length, 20); assert.equal(page.has_more, true);
        const ids = page.items.map(item => item.crew.id);
        while (page.has_more) { page = await list({ online_only: true }, sort, page.cursor); ids.push(...page.items.map(item => item.crew.id)); }
        assert.equal(new Set(ids).size, users.length - 1);
        assert.equal(await count({ online_only: true }), ids.length);
        assert.equal(ids.includes(profiles[0].group.id), false);
      }
    });
    await t.test('live counts match all filtered pages and reject invalid filters',async()=>{
      await as(0);
      for(const filters of [{}, {name:'best'}, {name:'%'}, {name:'_'}, {group_kinds:['friends']}, {child_age_bands:['13–17']},
        {travel_modes:['Namiot']}, {interests:['Rowery']}, {animal_kinds:['cat']}, {has_trips:true},
        {group_kinds:['family'],child_age_bands:['4–6'],travel_modes:['Kamper'],interests:['Ognisko'],animal_kinds:['dog']}]) {
        let page=await list(filters); let total=page.items.length;
        while(page.has_more){page=await list(filters,'compatibility',page.cursor);total+=page.items.length;}
        assert.equal(await count(filters),total);
      }
      for(const bad of [null,[],{name:'a'.repeat(81)},{group_kinds:['unknown']},{group_kinds:'family'},{has_trips:'yes'},
        {child_age_bands:['18–20']},{travel_modes:['plane']},{interests:['unknown']},{animal_kinds:['other']}])
        await assert.rejects(count(bad),e=>e.code==='22023');
    });
    await t.test('invalid sorting and cursors fail; hidden, blocked and suspended crews never enter ranking or detail',async()=>{
      await as(0);
      for(const sort of ['unknown',null]) await assert.rejects(list({},sort),e=>e.code==='22023');
      const cursor=(await list()).cursor;
      for(const bad of [{}, {...cursor,score:101}, {...cursor,score:-1}, {...cursor,id:'not-uuid'}, {...cursor,sort:'alphabetical'}])
        await assert.rejects(list({},'compatibility',bad),e=>e.code==='22023');
      await save(1,{...base,name:'Zeta best match'}); await rpc('save_my_group_visibility',[false,'']);
      await as(0); assert.equal((await list({name:'Zeta'})).items.length,0); assert.equal(await detail(1),null); assert.equal(await count({name:'Zeta'}),0);
      await as(1); await rpc('save_my_group_visibility',[true,'']); await as(0); await rpc('set_group_block',[profiles[1].group.id,true]);
      assert.equal((await list({name:'Zeta'})).items.length,0); assert.equal(await detail(1),null); assert.equal(await count({name:'Zeta'}),0);
      await rpc('set_group_block',[profiles[1].group.id,false]);
      await db.exec('reset role'); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);
      await as(0); assert.equal((await list({name:'Zeta'})).items.length,0); assert.equal(await detail(1),null); assert.equal(await count({name:'Zeta'}),0);
      await as(1); await assert.rejects(list(),e=>e.code==='42501'); await assert.rejects(count(),e=>e.code==='42501');
      await db.exec('reset role; set role anon'); await assert.rejects(list()); await assert.rejects(count());
    });
  } finally { await db.close(); }
});
