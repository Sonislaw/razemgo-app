import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {asUser,profile,testDatabase,trip} from './support/database.mjs';

const migration='202611080006_google_proposal_locations.sql';
const google=(id,kind='campground',name=id)=>({id:'google:'+id,source:'google',kind,googlePlaceId:id,userLabel:name,name,address:'',region:'',country:''});
const camp=google('ChIJ_proposal_camp'),near=google('ChIJ_proposal_near'),far=google('ChIJ_proposal_far');
const town=google('ChIJ_proposal_town','locality'),region=google('ChIJ_proposal_region','region'),country=google('ChIJ_proposal_country','country');
const pin=(lat=54,lng=18)=>({id:'manual:'+randomUUID(),source:'manual',kind:'place',name:'Miejsce wskazane ręcznie',address:'',region:'',country:'',latitude:lat,longitude:lng});

test('Google proposal locations preserve history and match modern destinations through the actual notification worker',async t=>{
 const db=await testDatabase({before:migration}),users=[randomUUID(),randomUUID()],groups=[];
 const root=()=>db.exec('reset role');
 const call=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
 const publish=async(i,place=camp,patch={},id=null,draft=false)=>{
  await asUser(db,users[i]);
  return call('save_my_trip',[{...trip,location_id:place.id,place_data:place,...patch},id,draft,randomUUID()]);
 };
 const geometry=async(id,lat,lng,bounds=null)=>{await db.exec('reset role;set role service_role');return call('record_google_place_geometry',[id,lat,lng,bounds]);};
 const run=async()=>{await db.exec('reset role;set role service_role');return call('process_proposal_notifications',[20]);};
 const matches=async(a,b)=>{await root();return value('select notifications_private.proposal_matches(o,p) value from public.trip_plans o cross join public.trip_plans p where o.id=$1 and p.id=$2',[a,b]);};
 const entries=async(id)=>{await root();return (await db.query("select * from public.notifications where recipient_group_id=$1 and proposed_trip_id=$2 and kind='proposal'",[groups[0],id])).rows;};
 const snapshot=async()=>{
  await root();const result={};
  for(const table of ['public.trip_plans','public.notifications','notifications_private.proposal_seen','notifications_private.proposal_jobs','push_private.events','push_private.deliveries','places_private.geometry'])
   result[table]=(await db.query(`select to_jsonb(t) value from ${table} t order by to_jsonb(t)::text`)).rows;
  return result;
 };
 const scenario=async(name,action)=>t.test(name,async()=>{
  await root();await db.exec('begin');
  try{await db.exec('delete from notifications_private.proposal_jobs');await action();}finally{await db.exec('rollback');await root();}
 });
 try{
  for(let i=0;i<2;i++){
   await root();await db.query('insert into auth.users(id) values($1)',[users[i]]);await asUser(db,users[i]);groups.push((await call('save_my_profile',[profile('Geografia '+i)])).group.id);
  }
  await asUser(db,users[0]);await call('register_my_push_device',[randomUUID(),randomUUID(),'ExponentPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
  for(const [p,lat,lng,bounds] of [[camp,54,18],[near,54.001,18.001],[far,48,9],[town,54.1,18],
   [region,54,18,{south:53,north:55,west:16,east:20}],[country,52,19,{south:49,north:55,west:14,east:24.5}]])await geometry(p.googlePlaceId,lat,lng,bounds??null);
  const own=await publish(0),previous=await publish(1,near);
  assert.equal(await matches(own.id,previous.id),false,'reproduces the pre-migration Google mismatch');
  for(let i=0;i<2;i++){await asUser(db,users[i]);await call('save_my_trip',[trip,null,false,randomUUID()]);}
  await run();const before=await snapshot();
  await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
  await t.test('migration preserves publications, notification history, seen pairs, queues and deliveries',async()=>{
   assert.deepEqual(await snapshot(),before);assert.equal(await matches(own.id,previous.id),true);
  });
  // Settle the baseline in this isolated database, keeping read history for the
  // deduplication checks. No real push provider is called by these SQL tests.
  await run();await root();await db.query('update public.notifications set read_at=now() where recipient_group_id=$1',[groups[0]]);
  await db.exec('delete from push_private.deliveries');

  for(const [name,place,mode] of [['same Google place',camp,'planned'],['nearby campsite with a different Google ID',near,'planned'],
   ['locality and its surrounding campsite',town,'flexible'],['region containing the campsite',region,'flexible'],['country containing the campsite',country,'flexible'],
   ['manual map point',pin(),'planned'],['manual address resolved to Google geometry',{...pin(),googlePlaceId:near.googlePlaceId,address:'Leśna 4',region:'pomorskie',country:'Polska'},'planned']])
   await scenario(name,async()=>{
    const proposed=await publish(1,place,{mode});
    assert.equal(await matches(own.id,proposed.id),true);assert.equal(await matches(proposed.id,own.id),true,'matching does not depend on publication direction');
    await run();assert.equal((await entries(proposed.id)).length,1);await run();assert.equal((await entries(proposed.id)).length,1);
   });

  await scenario('locality radius is 20 km; precise place radius is 1 km, with no name-only false matches',async()=>{
   const townTrip=await publish(0,town,{mode:'flexible'},own.id);
   const within=await publish(1,pin(54.22,18)),outside=await publish(1,pin(54.35,18));
   assert.equal(await matches(townTrip.id,within.id),true);assert.equal(await matches(townTrip.id,outside.id),false);
   await publish(0,camp,{},own.id);
   const tooFar=await publish(1,pin(54.03,18));assert.equal(await matches(own.id,tooFar.id),false);
   const distant=await publish(1,{...far,userLabel:camp.name,name:camp.name});assert.equal(await matches(own.id,distant.id),false);
  });

  await scenario('places outside the selected region/country do not match its centre radius',async()=>{
   for(const area of [region,country]){
    await publish(0,area,{mode:'flexible'},own.id);
    const outside=await publish(1,pin(55.2,18));
    assert.equal(await matches(own.id,outside.id),false);
   }
  });

  await scenario('legacy locality coordinates and text-only manual areas remain usable',async()=>{
   await root();const old=await value("select jsonb_build_object('latitude',latitude,'longitude',longitude) value from discovery_private.map_locations where id=$1",[trip.location_id]);assert(old);
   await publish(0,pin(old.latitude,old.longitude),{},own.id);
   await asUser(db,users[1]);const legacy=await call('save_my_trip',[trip,null,false,randomUUID()]);assert.equal(await matches(own.id,legacy.id),true);
   const area={id:'manual:'+randomUUID(),source:'manual',scope:'area',kind:'region',name:'Mazury',region:'Mazury',country:'Polska',address:''};
   await publish(0,area,{mode:'flexible'},own.id);
   const manual=await publish(1,{...pin(),region:'Mazury',country:'Polska'});assert.equal(await matches(own.id,manual.id),true);
  });

  for(const [name,patch,draft] of [['disjoint dates',{start_date:'2099-06-01',end_date:'2099-06-05'}],
   ['touching departure and arrival',{start_date:trip.end_date,end_date:'2099-05-27'}],['private listing',{visibility:'private'}],['draft',{},true]])
   await scenario(name,async()=>{const p=await publish(1,near,patch,null,draft??false);assert.equal(await matches(own.id,p.id),false);await run();assert.equal((await entries(p.id)).length,0);});

  for(const restriction of ['paused','completed','blocked-by-owner','blocked-by-other','suspended-owner','suspended-other','hidden-own','hidden-proposed'])
   await scenario(restriction,async()=>{
    const p=await publish(1,near);assert.equal(await matches(own.id,p.id),true);
    if(['paused','completed'].includes(restriction)){await asUser(db,users[1]);await call('change_my_trip_status',[p.id,restriction]);}
    else if(restriction.startsWith('blocked')){const actor=restriction==='blocked-by-owner'?0:1;await asUser(db,users[actor]);await call('set_group_block',[groups[1-actor],true]);}
    else{await root();if(restriction.startsWith('suspended'))await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[restriction==='suspended-owner'?0:1]]);
     else await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)',[restriction==='hidden-own'?own.id:p.id]);}
    assert.equal(await matches(own.id,p.id),false);await run();assert.equal((await entries(p.id)).length,0);
   });

  await scenario('manual pin edits with the same ID enqueue new matching work',async()=>{
   const place=pin(48,9),p=await publish(1,place);await run();assert.equal((await entries(p.id)).length,0);
   await root();await db.query('update public.trip_plans set place_data=$1 where id=$2',[{...place,latitude:54,longitude:18},p.id]);
   assert.equal(await value('select count(*)::integer value from notifications_private.proposal_jobs where trip_id=$1',[p.id]),1);
   await run();assert.equal((await entries(p.id)).length,1);
  });

  await scenario('late, changed and expired geometry requeues referenced trips; unchanged fresh geometry does not',async()=>{
   const place=google('ChIJ_proposal_late'),p=await publish(1,place);await run();assert.equal((await entries(p.id)).length,0);
   await geometry(place.googlePlaceId,54,18);await run();assert.equal((await entries(p.id)).length,1);
   await geometry(place.googlePlaceId,54,18);await root();assert.equal(await value('select count(*)::integer value from notifications_private.proposal_jobs where trip_id=$1',[p.id]),0);
   await db.query("update places_private.geometry set expires_at=now()-interval '1 second' where place_id=$1",[place.googlePlaceId]);
   await geometry(place.googlePlaceId,54,18);await root();assert.equal(await value('select count(*)::integer value from notifications_private.proposal_jobs where trip_id=$1',[p.id]),1);
   const first=await value('select first_queued_at value from notifications_private.proposal_jobs where trip_id=$1',[p.id]);
   await geometry(place.googlePlaceId,54.001,18.001);await root();assert.deepEqual(await value('select first_queued_at value from notifications_private.proposal_jobs where trip_id=$1',[p.id]),first);
   await run();assert.equal((await entries(p.id)).length,1,'a refresh never replays an existing notification');
  });

  await scenario('expired coordinates cannot match different places by an identical label',async()=>{
   const sameName={...near,userLabel:camp.name,name:camp.name};const p=await publish(1,sameName);
   await root();await db.query("update places_private.geometry set expires_at=now()-interval '1 second' where place_id=$1",[near.googlePlaceId]);
   assert.equal(await matches(own.id,p.id),false);await run();assert.equal((await entries(p.id)).length,0);
   const exact=await publish(1,camp);await root();await db.query("update places_private.geometry set expires_at=now()-interval '1 second' where place_id=$1",[camp.googlePlaceId]);
   assert.equal(await matches(own.id,exact.id),true,'an identical Google ID still identifies the same place');
  });

  await scenario('new matches share one digest, deduplicate and respect push opt-out',async()=>{
   const a=await publish(1,near),b=await publish(1,pin());await run();await run();
   assert.equal((await entries(a.id)).length,1);assert.equal((await entries(b.id)).length,1);
   await root();await db.exec("update push_private.deliveries set due_at=now()-interval '1 second' where status='pending';set role service_role");
   const jobs=(await db.query('select * from public.claim_push_deliveries(100)')).rows;
   assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'proposal');assert.equal(jobs[0].proposal_count,2);
   await asUser(db,users[0]);await call('save_my_notification_preference',['proposals',false]);
   const c=await publish(1,pin());await run();assert.equal((await entries(c.id)).length,1);
   await root();assert.equal(await value("select count(*)::integer value from push_private.deliveries where status='pending'"),0);
  });

  for(const role of ['authenticated','anon'])await scenario(role+' cannot invoke private matching or queue helpers',async()=>{
   await asUser(db,users[0]);await db.exec('set role '+role);
   for(const sql of ['select public.process_proposal_notifications(10)','select notifications_private.queue_proposal_geometry()',
    'select notifications_private.proposal_matches(o,p) from public.trip_plans o cross join public.trip_plans p']){
    await db.exec('savepoint denied');try{await assert.rejects(db.exec(sql),e=>e.code==='42501');}finally{await db.exec('rollback to denied;release denied');}
   }
  });
 }finally{await db.close();}
});
