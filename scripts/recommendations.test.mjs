import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';
import { profileFromRows, profileToPayload } from '../src/features/profile/profile-mapper.ts';
import { proposalFromRow, tripFromRow } from '../src/features/trips/trip-mapper.ts';
import { INITIAL_FILTERS } from '../src/features/discovery/filter-trips.ts';
import { discoveryFiltersPayload } from '../src/features/discovery/discovery-data.ts';
import { discoveryFiltersForTrip } from '../src/features/trips/own-trips-state.ts';
import { tripRecommendation } from '../src/features/recommendations/trip-recommendation.ts';
import { cardReasons, groupRecommendation, parseRecommendation, reasonText } from '../src/features/recommendations/recommendation.ts';

test('recommendation JSON rejects unsupported claims and renders controlled explanations',()=>{
  const base={version:2,label:null,context:{kind:'profile'},reasons:[]};
  assert.deepEqual(parseRecommendation(base),base);
  for(const value of [{...base,version:1},{...base,label:'weak'}, {...base,label:'similar_plans'},
    {...base,label:'shared_interests'}, {...base,reasons:[{code:'private_preferences'}]},
    {...base,reasons:[{code:'date_tolerance',days:8}]}, {...base,context:{kind:'trip'}}]) assert.throws(()=>parseRecommendation(value));
  assert.equal(reasonText({code:'date_tolerance',days:1}),'Termin w tolerancji ±1 dzień');
  assert.equal(reasonText({code:'date_tolerance',days:2}),'Termin w tolerancji ±2 dni');
  assert.equal(cardReasons({...base,label:'shared_interests',reasons:Array(3).fill({code:'interest',value:'Rowery'})}).length,2);
  assert.equal(cardReasons({...base,reasons:[{code:'travel_mode',value:'Kamper'}]}).length,0);
});

test('recommendation V2: factual evidence, contextual ranking, bounded pages and authorization',async t=>{
  const db=await testDatabase(),users=[],profiles=[],own=[];
  const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const as=i=>asUser(db,users[i]);
  const create=async(name,patch={})=>{
    await db.exec('reset role');const id=randomUUID();users.push(id);
    await db.query('insert into auth.users(id) values($1)',[id]);await as(users.length-1);
    const saved=await rpc('save_my_profile',[{...profile(name),...patch}]);profiles.push(saved);
    await rpc('save_my_group_visibility',[true,'Public description']);
  };
  const save=async(i,patch={})=>{await as(i);const row=await rpc('save_my_trip',[{...trip,...patch},null,false,randomUUID()]);if(i===0)own.push(row);return row;};
  const compare=async(id,filters={...INITIAL_FILTERS})=>{
    await as(0);const row=await rpc('get_discovery_trip_v2',[id,discoveryFiltersPayload(filters)]);
    assert.ok(row);
    const expected=tripRecommendation(proposalFromRow(row),profileFromRows(profiles[0].group,profiles[0].preferences),own.map(tripFromRow),filters,'2090-01-01');
    assert.deepEqual(parseRecommendation(row.recommendation),expected.recommendation);
    assert.equal(row.compatibility,undefined);
    assert.ok(!JSON.stringify(row.recommendation).includes('PRIVATE_PREFERENCES'));
    return row;
  };
  try {
    await create('Pierwsza ekipa',{matching:{group_kinds:['family'],child_age_bands:['4–6'],description:'PRIVATE_PREFERENCES'}});
    await create('Druga ekipa');
    const source=await save(0), exact=await save(1);
    await t.test('same dates/place, partial overlap, disjoint dates and a shared region agree with the local model',async()=>{
      const row=await compare(exact.id);assert.equal(row.recommendation.label,'similar_plans');
      assert.equal(row.recommendation.reasons[0].code,'same_place');
      const alias=await save(0,{location_region:'Pomorze'});
      assert.equal((await compare(exact.id,discoveryFiltersForTrip(tripFromRow(alias)))).recommendation.label,'similar_plans');
      const partial=await save(1,{start_date:'2099-05-23',end_date:'2099-05-27'});
      assert.equal((await compare(partial.id)).recommendation.label,'similar_plans');
      const region=await save(1,{mode:'flexible',location_kind:'region',location_id:'pl-region:pomorskie',location_name:'Pomorskie',location_region:''});
      assert.equal((await compare(region.id)).recommendation.reasons[0].code,'same_region');
      const disjoint=await save(1,{start_date:'2099-06-01',end_date:'2099-06-05'});
      assert.equal((await compare(disjoint.id)).recommendation.label,'shared_interests');
      const distant=await save(1,{location_name:'Zakopane',location_region:'małopolskie',location_id:'pl-locality:999999'});
      assert.equal((await compare(distant.id)).recommendation.label,'shared_interests');
    });
    await t.test('search criteria replace unrelated plans; tolerance is explicit and country alone cannot claim similar plans',async()=>{
      const filters={...INITIAL_FILTERS,dateRangeId:'custom',customDateRange:{startDate:'2099-05-24',endDate:'2099-05-27'},dateFlexibilityDays:1,locationId:'pl-region:pomorskie',location:'Pomorskie'};
      const row=await compare(exact.id,filters);
      assert.equal(row.recommendation.context.kind,'search');
      assert.equal(row.recommendation.label,'similar_plans');
      assert.ok(row.recommendation.reasons.some(reason=>reason.code==='date_tolerance'&&reason.days===1));
      const ranked=await rpc('search_public_trips_v2',[discoveryFiltersPayload(filters),'compatibility',null,20]);
      const dateKinds=ranked.items.map(item=>item.recommendation.reasons.find(reason=>reason.code==='overlapping_dates'||reason.code==='date_tolerance')?.code);
      const firstShifted=dateKinds.indexOf('date_tolerance');
      assert.ok(firstShifted>0);
      assert.ok(dateKinds.slice(firstShifted).every(kind=>kind!=='overlapping_dates'));
      assert.equal((await compare(exact.id,{...filters,dateFlexibilityDays:0})).recommendation.label,'shared_interests');
      assert.equal((await compare(exact.id,{...filters,locationId:'country:PL',location:'Polska'})).recommendation.label,'shared_interests');
      const dateOnly=await compare(exact.id,{...filters,location:'',locationId:undefined});
      assert.equal(dateOnly.recommendation.context.kind,'search');assert.notEqual(dateOnly.recommendation.label,'similar_plans');
      const ownFilter=discoveryFiltersForTrip(tripFromRow(source));
      assert.equal((await compare(exact.id,ownFilter)).recommendation.context.tripId,source.id);
      assert.equal((await compare(exact.id,{...ownFilter,location:'Mazowsze',locationId:'pl-region:mazowieckie'})).recommendation.label,'shared_interests');
    });
    await t.test('several own journeys never contribute mixed date/location evidence',async()=>{
      const second=await save(0,{location_name:'Zakopane',location_region:'małopolskie',location_id:'pl-locality:999999',start_date:'2099-06-01',end_date:'2099-06-05'});
      const cross=await save(1,{start_date:second.start_date,end_date:second.end_date});
      const row=await compare(cross.id);assert.notEqual(row.recommendation.label,'similar_plans');
      assert.ok([source.id,second.id].includes(row.recommendation.context.tripId));
    });
    await t.test('five-item global ranking, direct detail and refresh share explanations; V1 stays unchanged',async()=>{
      for(let i=0;i<6;i++)await save(1,{start_date:'2099-07-01',end_date:'2099-07-05',description:'Kolejna propozycja wspólnego wyjazdu numer '+i});
      await as(0);let page=await rpc('search_public_trips_v2',[{},'compatibility',null,5]);
      assert.equal(page.items.length,5);assert.equal(page.cursor.version,2);
      const all=[...page.items];
      while(page.has_more){page=await rpc('search_public_trips_v2',[{},'compatibility',page.cursor,5]);assert.ok(page.items.length<=5);all.push(...page.items);}
      assert.equal(new Set(all.map(item=>item.trip.id)).size,all.length);assert.equal(page.total_count,all.length);
      assert.equal(all[0].recommendation.label,'similar_plans');
      for(const row of all){
        const detail=await rpc('get_discovery_trip_v2',[row.trip.id]);assert.deepEqual(detail.recommendation,row.recommendation);
      }
      const refreshed=await rpc('refresh_public_trip_results_v2',[all.slice(0,5).map(item=>item.trip.id)]);
      assert.equal(refreshed.length,5);for(const row of refreshed)assert.deepEqual(row.recommendation,all.find(item=>item.trip.id===row.trip.id).recommendation);
      const localRanks=all.map(row=>tripRecommendation(proposalFromRow(row),profileFromRows(profiles[0].group,profiles[0].preferences),own.map(tripFromRow),INITIAL_FILTERS,'2090-01-01').rank);
      assert.deepEqual(localRanks,[...localRanks].sort((a,b)=>b-a));
      const v1=await rpc('search_public_trips',[{},'compatibility',null,5]);assert.ok(v1.items.every(row=>row.recommendation===undefined&&row.compatibility.score<=100));
      const first=await rpc('search_public_trips_v2',[{},'default',null,5]);
      await assert.rejects(rpc('search_public_trips_v2',[{animal_kinds:['dog']},'default',first.cursor,5]),e=>e.code==='22023');
      await as(1);await assert.rejects(rpc('search_public_trips_v2',[{},'default',first.cursor,5]),e=>e.code==='22023');
    });
    await t.test('crew explanations use public facts regardless of low or missing numeric scores',async()=>{
      await as(0);const page=await rpc('list_ranked_public_groups_v2',[{},'compatibility',null,5]);
      const row=page.items.find(row=>row.crew.id===profiles[1].group.id);
      const expected=groupRecommendation(profileFromRows(profiles[0].group,profiles[0].preferences).group,profileFromRows(profiles[1].group,profiles[1].preferences).group);
      assert.deepEqual(row.recommendation,expected);
      const detail=await rpc('get_public_group_v2',[profiles[1].group.id,null,5]);assert.deepEqual(detail.recommendation,expected);assert.equal(detail.trips.length,5);
      assert.ok(detail.trips.every(row=>row.recommendation.version===2));
      const next=await rpc('get_public_group_v2',[profiles[1].group.id,detail.cursor,5]);assert.equal(next.trips.some(row=>detail.trips.some(old=>old.trip.id===row.trip.id)),false);
      const refresh=await rpc('refresh_public_group_results_v2',[[profiles[1].group.id]]);assert.deepEqual(refresh[0].recommendation,expected);
      assert.equal((await rpc('get_public_group_v2',[profiles[0].group.id,null,5])),null);
      assert.equal(page.items.some(item=>Object.hasOwn(item,'compatibility')),false);
      await create('Pusta ekipa',{kind:'couple',child_count:0,child_age_bands:[],interests:[],travel_mode:'Namiot',matching:{group_kinds:[],child_age_bands:[],description:''}});
      await as(0);const empty=await rpc('get_public_group_v2',[profiles[2].group.id,null,5]);assert.equal(empty.recommendation.label,null);assert.deepEqual(empty.recommendation.reasons,[]);
    });
    await t.test('a viewer without active plans, children or interests gets no invented rating; changed context invalidates old cursors',async()=>{
      await as(0);const previous=await rpc('search_public_trips_v2',[{},'default',null,5]);
      for(const row of own)await rpc('change_my_trip_status',[row.id,'paused']);
      own.length=0;
      const original=profiles[0];
      profiles[0]=await rpc('save_my_profile',[{...profile('Pierwsza ekipa'),kind:'couple',child_count:0,child_age_bands:[],interests:[],travel_mode:'Samochód',matching:{group_kinds:[],child_age_bands:['4–6'],description:'PRIVATE_PREFERENCES'}}]);
      const result=await compare(exact.id);
      assert.equal(result.recommendation.label,null);assert.deepEqual(result.recommendation.reasons,[]);assert.equal(result.recommendation.context.kind,'profile');
      await assert.rejects(rpc('search_public_trips_v2',[{},'default',previous.cursor,5]),e=>e.code==='22023');
      profiles[0]=await rpc('save_my_profile',[profileToPayload(profileFromRows(original.group,original.preferences))]);
    });
    await t.test('blocked, moderated and suspended accounts cannot bypass V2; anonymous and private-helper access is denied',async()=>{
      await as(0);await rpc('set_group_block',[profiles[1].group.id,true]);
      assert.equal(await rpc('get_discovery_trip_v2',[exact.id]),null);assert.equal(await rpc('get_public_group_v2',[profiles[1].group.id,null,5]),null);
      assert.deepEqual(await rpc('refresh_public_trip_results_v2',[[exact.id]]),[]);assert.deepEqual(await rpc('refresh_public_group_results_v2',[[profiles[1].group.id]]),[]);
      await rpc('set_group_block',[profiles[1].group.id,false]);
      await db.exec('reset role');await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)',[exact.id]);await as(0);
      assert.equal(await rpc('get_discovery_trip_v2',[exact.id]),null);
      await assert.rejects(db.query('select discovery_private.recommendation_context($1,$2)',[profiles[1].group.id,{}]),e=>e.code==='42501');
      await db.exec('reset role');await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);await as(0);
      assert.equal(await rpc('get_public_group_v2',[profiles[1].group.id,null,5]),null);
      await db.exec('reset role;set role anon');
      for(const [name,args] of [['search_public_trips_v2',[]],['get_discovery_trip_v2',[exact.id]],['refresh_public_trip_results_v2',[[exact.id]]],['list_ranked_public_groups_v2',[]],['get_public_group_v2',[profiles[1].group.id]],['refresh_public_group_results_v2',[[profiles[1].group.id]]]]) await assert.rejects(rpc(name,args),e=>e.code==='42501');
    });
  } finally {await db.close();}
});
