import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('background proposals: closed-app discovery, grouped delivery, privacy and bounded retries',async t=>{
  const db=new PGlite(),users=Array.from({length:4},randomUUID),groups=[];
  const migration='202610270002_background_proposals.sql';
  const plan={mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-25',
    location_id:'test-coast',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',
    travel_mode:'Kamper',description:'Morze, spokojny wypoczynek i wspólne wycieczki rowerowe.',landscape:'coast',
    interests:['Rowery'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]};
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    const root=()=>db.exec('reset role');
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$1,false)",[users[i]]);};
    const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const rpc=(name,args=[])=>value(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
    const publish=async(i,overrides={},id=null)=>{await as(i);return rpc('save_my_trip',[{...plan,...overrides},id,false,randomUUID()]);};
    const run=async(limit=10)=>{await db.exec('reset role;set role service_role');return rpc('process_proposal_notifications',[limit]);};
    const inbox=()=>rpc('get_my_notifications');
    const claim=async()=>{await root();await db.exec('set role service_role');return(await db.query('select * from public.claim_push_deliveries(100)')).rows;};
    const due=async()=>{await root();await db.exec("update push_private.deliveries set due_at=now()-interval '1 second' where status='pending'");};
    const scenario=async(name,action)=>{await t.test(name,async()=>{await root();await db.exec('begin');try{await action();}finally{await db.exec('rollback');await root();}});};
    const denied=async action=>{await db.exec('savepoint denied');try{await assert.rejects(action,e=>e.code==='42501');}finally{await db.exec('rollback to denied;release denied');}};
    for(let i=0;i<users.length;i++){
      await root();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[users[i]]);
      await as(i);groups.push((await rpc('save_my_profile',[{name:'Ekipa '+i,avatar_id:'camp-bear',kind:'family',adult_count:2,
        child_count:1,child_age_bands:['7–9'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}])).group.id);
    }
    await as(0);await rpc('register_my_push_device',[randomUUID(),randomUUID(),'ExponentPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    await rpc('save_my_notification_preference',['messages',false]);
    const own=await publish(0),historical=await publish(1);
    for(const i of[0,1]){await as(i);await inbox();
      const entries=(await inbox()).items;await rpc('mark_my_notifications_read',[entries.map(n=>n.id)]);}
    await root();await db.exec(await readFile(new URL(migration,dir),'utf8'));

    await scenario('migration preserves previous preferences and history without replaying phone alerts',async()=>{
      assert.deepEqual(await run(),{processed:0,created:0,queued:0});await as(0);const data=await inbox();
      assert.equal(data.preferences.push_messages,false);assert.equal(data.preferences.push_proposals,true);
      assert.ok(data.items.some(n=>n.proposed_trip_id===historical.id));assert.equal(data.unread_count,0);
      await root();assert.equal(await value('select count(*)::int value from push_private.events'),0);
    });
    await scenario('publication creates proposals without fetching an inbox; repeated processing and edits do not duplicate them',async()=>{
      const p=await publish(1);const result=await run();assert.equal(result.created,1);await as(0);const data=await inbox();
      assert.equal(data.items.filter(n=>n.proposed_trip_id===p.id).length,1);assert.equal(data.unread_count,1);
      assert.equal(data.items.find(n=>n.proposed_trip_id===p.id).own_trip_id,own.id);
      await publish(1,{description:'Nowy opis tej samej podróży, bez nowego powiadomienia.'},p.id);
      await as(1);await rpc('change_my_trip_status',[p.id,'paused']);await rpc('change_my_trip_status',[p.id,'published']);
      await run();await run();await as(0);assert.equal((await inbox()).items.filter(n=>n.proposed_trip_id===p.id).length,1);
      await root();assert.equal(await value('select count(*)::int value from notifications_private.proposal_seen where recipient_group_id=$1 and proposed_trip_id=$2',[groups[0],p.id]),1);
    });
    await scenario('multiple matching own plans still create one notification; publication of an own plan can find existing trips',async()=>{
      const other=await publish(0,{description:'Drugi plan naszej ekipy w tym samym terminie i regionie.'});
      const p=await publish(1);await run();await as(0);assert.equal((await inbox()).items.filter(n=>n.proposed_trip_id===p.id).length,1);
      await publish(2);await run();await as(2);assert.ok((await inbox()).items.some(n=>n.proposed_trip_id===own.id||n.proposed_trip_id===other.id));
    });
    await scenario('a five-minute digest includes multiple new proposals and selects an unread available destination at dispatch',async()=>{
      const p=await publish(1),q=await publish(1,{description:'Kolejna propozycja podróży nad morze z rowerami.'});await run();
      await root();assert.equal(await value("select count(*)::int value from push_private.events where kind='proposal'"),1);
      assert.equal(await value('select count(*)::int value from notifications_private.proposal_push_items'),2);
      assert.equal((await claim()).length,0);await due();const jobs=await claim();assert.equal(jobs.length,1);
      assert.equal(jobs[0].kind,'proposal');assert.equal(jobs[0].proposal_count,2);assert.ok([p.id,q.id].includes(jobs[0].trip_id));assert.ok(jobs[0].notification_id);
      await root();assert.equal(await value('select proposed_trip_id value from public.notifications where id=$1',[jobs[0].notification_id]),jobs[0].trip_id);
    });
    await scenario('read or unavailable first items do not suppress other proposals in a digest',async()=>{
      const p=await publish(1),q=await publish(1);await run();await as(0);const n=(await inbox()).items.find(n=>n.proposed_trip_id===p.id);
      await rpc('mark_my_notifications_read',[[n.id]]);await due();const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].trip_id,q.id);assert.equal(jobs[0].proposal_count,1);
    });
    await scenario('opt-out skips queued deliveries, keeps inbox entries and does not replay them after opt-in',async()=>{
      await publish(1);await run();await as(0);const pref=await rpc('save_my_notification_preference',['proposals',false]);
      assert.equal(pref.push_proposals,false);assert.equal(pref.push_messages,false);assert.equal((await inbox()).unread_count,1);
      await due();assert.equal((await claim()).length,0);await as(0);await rpc('save_my_notification_preference',['proposals',true]);
      await run();await due();assert.equal((await claim()).length,0);
      await as(0);await rpc('save_my_notification_preference',['proposals',false]);const p=await publish(1);await run();await as(0);
      assert.ok((await inbox()).items.some(n=>n.proposed_trip_id===p.id));
    });
    await scenario('drafts, private trips, wrong dates and regions, and mismatched requested crews do not generate proposals',async()=>{
      await as(1);await rpc('save_my_trip',[plan,null,true,randomUUID()]);await publish(1,{visibility:'private'});
      await publish(1,{start_date:'2099-06-01',end_date:'2099-06-05'});await publish(1,{location_name:'Zakopane',location_region:'Małopolskie'});
      await publish(0,{matching_group_kinds:['solo']},own.id);await publish(1);await run();await as(0);assert.equal((await inbox()).unread_count,0);
    });
    await scenario('requested child ages apply, while bringing a pet is not an exclusion',async()=>{
      await publish(0,{matching_child_age_bands:['4–6']},own.id);await publish(1);await run();await as(0);assert.equal((await inbox()).unread_count,0);
      await publish(0,{matching_child_age_bands:['7–9']},own.id);const p=await publish(1,{animal_kinds:['dog']});await run();await as(0);
      assert.ok((await inbox()).items.some(n=>n.proposed_trip_id===p.id));
    });
    await scenario('country areas work and similarly named regions are not confused',async()=>{
      await publish(0,{mode:'flexible',location_id:'country:PL',location_name:'Polska',location_region:'',location_kind:'country'},own.id);
      const p=await publish(1,{location_name:'Zakopane',location_region:'Małopolskie'});await run();await as(0);
      assert.ok((await inbox()).items.some(n=>n.proposed_trip_id===p.id));
      await publish(0,{location_name:'Katowice',location_region:'Śląskie'},own.id);
      const q=await publish(1,{location_name:'Wrocław',location_region:'Dolnośląskie'});await run();await as(0);
      assert.equal((await inbox()).items.some(n=>n.proposed_trip_id===q.id),false);
    });
    await scenario('a changed crew profile can create its first previously ineligible match',async()=>{
      await publish(0,{matching_child_age_bands:['4–6']},own.id);const p=await publish(1);await run();await as(0);
      assert.equal((await inbox()).items.some(n=>n.proposed_trip_id===p.id),false);
      await as(1);await rpc('save_my_profile',[{name:'Ekipa 1',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,
        child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}]);
      await run();await as(0);assert.ok((await inbox()).items.some(n=>n.proposed_trip_id===p.id));
    });
    for(const change of['paused','cancelled','hidden','suspended','blocked','expired','changed-region'])await scenario(`${change} is revalidated before phone delivery`,async()=>{
      const p=await publish(1);await run();
      if(['paused','cancelled'].includes(change)){await as(1);await rpc('change_my_trip_status',[p.id,change]);}
      if(change==='blocked'){await as(1);await rpc('set_group_block',[groups[0],true]);}
      if(change==='expired'){await root();await db.exec('alter table public.trip_plans disable trigger trip_write_guard');
        await db.query("update public.trip_plans set start_date='2020-05-01',end_date='2020-05-05' where id=$1",[p.id]);
        await db.exec('alter table public.trip_plans enable trigger trip_write_guard');}
      if(change==='changed-region')await publish(1,{location_name:'Zakopane',location_region:'Małopolskie'},p.id);
      if(change==='hidden'){await root();await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)',[p.id]);}
      if(change==='suspended'){await root();await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[1]]);}
      await due();assert.equal((await claim()).length,0);
    });
    await scenario('all read and an ended own plan cannot receive an old proposal',async()=>{
      await publish(1);await run();await as(0);await rpc('mark_my_notifications_read',[(await inbox()).items.map(n=>n.id)]);
      await due();assert.equal((await claim()).length,0);
      const p=await publish(1);await run();await as(0);await rpc('change_my_trip_status',[own.id,'completed']);await due();assert.equal((await claim()).length,0);
      await as(0);const n=(await inbox()).items.find(n=>n.proposed_trip_id===p.id);assert.equal(n.available,false);
    });
    await scenario('deleting the proposed trip or revoking the device session prevents phone delivery',async()=>{
      const p=await publish(1);await run();await as(1);await rpc('delete_my_trip',[p.id]);await due();assert.equal((await claim()).length,0);
      await publish(1);await run();await root();await db.query('delete from auth.sessions where user_id=$1',[users[0]]);
      await due();assert.equal((await claim()).length,0);
    });
    await scenario('account deletion cascades through jobs, deduplication and digest state',async()=>{
      await publish(1);await run();await root();await db.query('delete from auth.users where id=$1',[users[0]]);
      assert.equal(await value('select count(*)::int value from notifications_private.proposal_seen where recipient_group_id=$1',[groups[0]]),0);
      assert.equal(await value('select count(*)::int value from notifications_private.proposal_push_batches where recipient_group_id=$1',[groups[0]]),0);
    });
    await scenario('workers stop at the pair budget, retain remaining work and eventually process every proposal once',async()=>{
      for(let i=0;i<205;i++)await publish(1,{description:'Propozycja numer '+i+', wspólny wypoczynek nad morzem.'});
      await as(0);await rpc('change_my_trip_status',[own.id,'paused']);await rpc('change_my_trip_status',[own.id,'published']);
      await root();await db.query("update notifications_private.proposal_jobs set queued_at=case when trip_id=$1 then now()-interval '1 minute' else now()+interval '1 minute' end",[own.id]);
      const first=await run(1);assert.equal(first.created,200);await root();assert.equal(await value('select count(*)::int value from notifications_private.proposal_jobs where trip_id=$1',[own.id]),1);
      const second=await run(1);assert.equal(second.created,5);await root();assert.equal(await value("select count(*)::int value from public.notifications where recipient_group_id=$1 and kind='proposal' and read_at is null",[groups[0]]),205);
      assert.equal(await value("select count(*)::int value from push_private.events where recipient_group_id=$1 and kind='proposal'",[groups[0]]),1);
    });
    await scenario('worker RPC and private state are inaccessible to ordinary accounts; notification ownership is enforced',async()=>{
      await publish(1);await run();await as(2);assert.equal((await inbox()).items.length,0);
      await denied(()=>rpc('process_proposal_notifications'));
      await denied(()=>db.query('select * from notifications_private.proposal_seen'));
      await db.exec('reset role;set role anon');await denied(()=>rpc('process_proposal_notifications'));
    });
  }finally{await db.close();}
});
