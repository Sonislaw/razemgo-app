import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {tripCompatibility} from '../src/features/discovery/compatibility.ts';
import {profileFromRows} from '../src/features/profile/profile-mapper.ts';
import {proposalFromRow,tripFromRow} from '../src/features/trips/trip-mapper.ts';
import {INITIAL_FILTERS} from '../src/features/discovery/filter-trips.ts';
import {discoveryFiltersPayload} from '../src/features/discovery/discovery-data.ts';

test('server trip discovery: filters, global ranking, cursors, counts and authorization',async t=>{
  const db=new PGlite(),users=[],groups=[],profiles=[],trips=[];
  const profile={name:'Ekipa kontrolna',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery','Ognisko'],animal_kinds:['dog'],matching:{group_kinds:['family'],child_age_bands:['4–6'],description:'PRIVATE_PROFILE_SENTINEL'}};
  const base={mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i ognisko.',landscape:'coast',interests:['Rowery'],animal_kinds:['dog'],matching_group_kinds:['family'],matching_child_age_bands:['4–6']};
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
    const create=async p=>{const i=users.length;users.push(randomUUID());await root();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[users[i]]);await as(i);const s=await rpc('save_my_profile',[{...profile,...p}]);groups.push(s.group.id);profiles.push(s);return i;};
    const save=async(i,patch={},draft=false)=>{await as(i);const saved=await rpc('save_my_trip',[{...base,...patch},null,draft,randomUUID()]);trips.push(saved);return saved;};
    const search=(f={},sort='default',cursor=null,size=20)=>rpc('search_public_trips',[f,sort,cursor,size]);
    const count=f=>rpc('count_public_trips',[f??{}]);
    await create();await create({name:'Druga ekipa'});
    const own=await save(0),other=await save(1);await as(0);
    await t.test('first page, independent detail and total count share visibility and score with the local model',async()=>{
      const result=await search();assert.equal(result.items.length,1);assert.equal(result.total_count,1);assert.equal(result.has_more,false);
      assert.equal(result.items[0].trip.id,other.id);assert.equal(await count(),1);
      const expected=tripCompatibility(proposalFromRow(result.items[0]),profileFromRows(profiles[0].group,profiles[0].preferences),[tripFromRow(own)],INITIAL_FILTERS,'2090-01-01');
      assert.deepEqual(result.items[0].compatibility,expected);
      assert.equal(JSON.stringify(result).includes('PRIVATE_PROFILE_SENTINEL'),false);assert.equal(result.items[0].crew.owner_user_id,undefined);
      const detail=await rpc('get_discovery_trip',[other.id,{location_query:'no matches'}]);assert.equal(detail.trip.id,other.id);
      assert.equal(await rpc('get_discovery_trip',[own.id]),null);
    });
    await create({name:'Para z lasu',kind:'couple',child_count:0,child_age_bands:[],animal_kinds:['cat']});
    const flexible=await save(2,{mode:'flexible',location_id:'pl-region:pomorskie',location_name:'Pomorskie',location_region:'',location_kind:'region',campground_name:'',landscape:'forest',animal_kinds:['cat']});
    await as(0);
    await t.test('all filters use AND across categories, OR within a category and literal normalized place search',async()=>{
      const cases=[
        [{trip_modes:['planned']},[other.id]], [{trip_modes:['flexible']},[flexible.id]],
        [{landscapes:['coast']},[other.id]],[{landscapes:['forest']},[flexible.id]],
        [{group_kinds:['couple']},[flexible.id]],[{child_age_bands:['4–6']},[other.id]],
        [{animal_kinds:['cat']},[flexible.id]],[{animal_kinds:['dog','cat']},[other.id,flexible.id]],
        [{location_query:'CHLAPOWO'},[other.id]],[{location_query:'pomorze'},[other.id]],
        [{location_query:'%'},[]],[{location_query:'_'},[]],
        [{trip_modes:['flexible'],animal_kinds:['dog']},[]],
        [{location:{id:'pl-region:pomorskie',name:'Pomorskie',region:'',country:'Polska',kind:'region'}},[other.id,flexible.id]],
        [{location:{id:'country:PL',name:'Polska',region:'',country:'Polska',kind:'country'}},[other.id,flexible.id]],
        [{location:{id:'pl-locality:4259',name:'Chłapowo',region:'Pomorskie',country:'Polska',kind:'village'}},[other.id]],
      ];
      for(const[f,ids]of cases){const page=await search(f);assert.deepEqual(page.items.map(p=>p.trip.id).sort(),ids.sort(),JSON.stringify(f));assert.equal(page.total_count,ids.length);assert.equal(await count(f),ids.length);}
    });
    await t.test('date endpoints are calendar nights; tolerance shifts the full selected stay',async()=>{
      const exact={start_date:'2099-05-24',end_date:'2099-05-27',tolerance_days:0};
      assert.equal(await count(exact),0);assert.equal(await count({...exact,tolerance_days:1}),2);
      assert.equal(await count({...exact,start_date:'2099-05-25',tolerance_days:1}),0);
      assert.equal(await count({...exact,start_date:'2099-05-25',tolerance_days:2}),2);
      const page=await search({...exact,tolerance_days:1});assert.ok(page.items.every(item=>item.compatibility.reasons.includes('Pasujące terminy')));
    });
    const low=[];
    for(let i=0;i<25;i++)low.push(await save(1,{landscape:'forest',travel_mode:'Namiot',interests:['Kajaki'],location_id:'pl-locality:test',location_name:'Łódź',location_region:'Łódzkie'}));
    await root();await db.query("update public.trip_plans set published_at='2026-01-01T10:00:00Z' where id=$1",[other.id]);
    await db.query("update public.trip_plans set published_at='2026-02-01T10:00:00Z' where id=any($1::uuid[])",[low.map(p=>p.id)]);await as(0);
    await t.test('global score ordering finds a best match outside the latest page; cursors cover timestamp/score ties without duplicates',async()=>{
      const first=await search();assert.equal(first.items.length,20);assert.equal(first.total_count,27);assert.equal(first.has_more,true);
      assert.equal(first.items.some(p=>p.trip.id===other.id),false);
      const ranked=await search({},'compatibility');assert.equal(ranked.items[0].trip.id,other.id);assert.equal(ranked.items[0].compatibility.score,100);
      for(const sort of ['default','compatibility']){
        let cursor=null;const seen=[];let page;
        do{page=await search({},sort,cursor);seen.push(...page.items);cursor=page.has_more?page.cursor:null;}while(cursor);
        assert.equal(seen.length,27);assert.equal(new Set(seen.map(p=>p.trip.id)).size,27);assert.equal(await count(),27);
        if(sort==='compatibility'){const scores=seen.map(p=>p.compatibility.score);assert.deepEqual(scores,[...scores].sort((a,b)=>b-a));}
      }
      const filtered=await search({landscapes:['coast']});assert.equal(filtered.items.length,1);assert.equal(filtered.has_more,false);assert.equal(filtered.total_count,1);
      const one=await search({},'default',null,1);assert.equal(one.items.length,1);assert.equal(one.total_count,27);
    });
    await t.test('favorite membership and its count run before pagination and are private to the current viewer',async()=>{
      await rpc('set_my_trip_favorite',[other.id,true]);const f={favorites_only:true};assert.equal(await count(f),1);
      assert.deepEqual((await search(f)).items.map(p=>p.trip.id),[other.id]);
      await as(2);assert.equal(await count(f),0);await as(0);
      await rpc('set_my_trip_favorite',[other.id,false]);assert.equal(await count(f),0);
    });
    await t.test('ranking preserves the existing formula for filters, source plans and the best single own plan',async()=>{
      await save(0,{landscape:'forest',location_id:'pl-region:pomorskie',location_kind:'region',mode:'flexible',location_name:'Pomorskie',location_region:'',interests:['Kajaki'],animal_kinds:['cat']});await as(0);
      for(const filters of [INITIAL_FILTERS,{...INITIAL_FILTERS,sourceTripId:own.id},{...INITIAL_FILTERS,sourceTripId:other.id},
        {...INITIAL_FILTERS,childAgeBands:['7–9'],groupKinds:['couple']},
        {...INITIAL_FILTERS,dateRangeId:'custom',customDateRange:{startDate:'2099-05-24',endDate:'2099-05-27'},dateFlexibilityDays:2}]){
        const payload=discoveryFiltersPayload(filters);
        // Detail accepts an arbitrary visible ID even when it misses list filters.
        for(const candidate of [other,flexible,low[0]]){
          const detail=await rpc('get_discovery_trip',[candidate.id,payload]);
          const expected=tripCompatibility(proposalFromRow(detail),profileFromRows(profiles[0].group,profiles[0].preferences),trips.filter(p=>p.group_id===groups[0]).map(tripFromRow),filters,'2090-01-01');
          assert.deepEqual(detail.compatibility,expected);
        }
      }
    });
    await t.test('invalid filters and incompatible cursors fail clearly instead of ignoring constraints',async()=>{
      for(const f of [null,[],{trip_modes:[]},{trip_modes:['bad']},{landscapes:'coast'},{animal_kinds:['other']},{group_kinds:['solo','solo']},
        {favorites_only:'true'},{location_query:'x'.repeat(201)},{location:{id:'bad'}},{start_date:'2099-02-30',end_date:'2099-03-04'},
        {start_date:'2099-02-01'},{start_date:'2099-02-04',end_date:'2099-02-01'},{tolerance_days:8},{tolerance_days:1.5},{source_trip_id:'bad'}]){
        await assert.rejects(search(f),e=>e.code==='22023');await assert.rejects(rpc('count_public_trips',[f]),e=>e.code==='22023');
      }
      const cursor=(await search()).cursor;
      await assert.rejects(search({animal_kinds:['dog']},'default',cursor),e=>e.code==='22023');
      await assert.rejects(search({},'compatibility',cursor),e=>e.code==='22023');
      for(const c of [{},{...cursor,id:'bad'},{...cursor,published_at:'infinity'},{...cursor,score:101}])await assert.rejects(search({},'default',c),e=>e.code==='22023');
      for(const n of [0,21,null])await assert.rejects(search({},'default',null,n),e=>e.code==='22023');
    });
    await t.test('hidden, private, paused, deleted and ended trips never return through lists, counts or direct links',async()=>{
      await save(1,{},true);await save(1,{visibility:'private'});const paused=await save(1);await rpc('change_my_trip_status',[paused.id,'paused']);
      const ended=await save(1);await root();await db.exec('alter table public.trip_plans disable trigger user');
      await db.query("update public.trip_plans set start_date='2020-01-01',end_date='2020-01-04' where id=$1",[ended.id]);
      await db.exec('alter table public.trip_plans enable trigger user');
      await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)',[other.id]);await as(0);
      assert.equal(await rpc('get_discovery_trip',[other.id]),null);assert.equal(await rpc('get_discovery_trip',[paused.id]),null);assert.equal(await rpc('get_discovery_trip',[ended.id]),null);
      assert.equal(await count(),26);await root();await db.query('delete from moderation_private.hidden_trips where trip_id=$1',[other.id]);await as(0);
      for(const blocker of [0,1]){await as(blocker);await rpc('set_group_block',[groups[blocker===0?1:0],true]);await as(0);
        assert.equal(await count(),1);assert.equal((await search()).items[0].trip.id,flexible.id);assert.equal(await rpc('get_discovery_trip',[other.id]),null);
        await as(blocker);await rpc('set_group_block',[groups[blocker===0?1:0],false]);}
      await root();await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);await as(0);assert.equal(await count(),1);
      await root();await db.query('delete from moderation_private.suspended_accounts where user_id=$1',[users[1]]);await as(0);
    });
    await t.test('profiles with no active own plan retain profile-only scores and source IDs cannot borrow another crew plan',async()=>{
      await as(0);for(const ownTrip of trips.filter(p=>p.group_id===groups[0]))await rpc('change_my_trip_status',[ownTrip.id,'paused']);
      const filters={...INITIAL_FILTERS,sourceTripId:other.id};
      const detail=await rpc('get_discovery_trip',[other.id,discoveryFiltersPayload(filters)]);
      const expected=tripCompatibility(proposalFromRow(detail),profileFromRows(profiles[0].group,profiles[0].preferences),[],filters,'2090-01-01');
      assert.deepEqual(detail.compatibility,expected);assert.equal(await rpc('get_discovery_trip',[randomUUID()]),null);
    });
    await t.test('active-session enforcement, private helpers and anonymous denial apply to every endpoint',async()=>{
      await as(0);
      await assert.rejects(db.query("select discovery_private.matching_context($1,'{}')",[groups[1]]),e=>e.code==='42501');
      await root();await db.query('delete from auth.sessions where user_id=$1',[users[0]]);await as(0);
      for(const fn of [()=>search(),()=>count(),()=>rpc('get_discovery_trip',[other.id])])await assert.rejects(fn(),e=>e.code==='42501');
      await db.exec('reset role;set role anon');
      for(const fn of [()=>search(),()=>count(),()=>rpc('get_discovery_trip',[other.id])])await assert.rejects(fn(),e=>e.code==='42501');
    });
  }finally{await db.close();}
});
