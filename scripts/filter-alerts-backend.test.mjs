import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase, trip } from './support/database.mjs';

test('saved-filter alerts: opt-in, exact criteria, closed digests, safe delivery and private state', async t => {
  const db = await testDatabase();
  const users = [randomUUID(),randomUUID(),randomUUID()], groups = [];
  const root = () => db.exec('reset role');
  const as = i => asUser(db,users[i]);
  let inScenario=false;
  const query = async (sql,args=[]) => {
    if(inScenario) await db.exec('savepoint filter_test');
    try { const result=await db.query(sql,args); if(inScenario)await db.exec('release savepoint filter_test'); return result; }
    catch(e){if(inScenario)await db.exec('rollback to savepoint filter_test;release savepoint filter_test');throw e;}
  };
  const rpc = async (name,args=[]) => (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const set = async (filters={},kind='trips',id=randomUUID(),name='Wakacje') => { await as(0); return rpc('save_my_filter_set',[id,kind,name,JSON.stringify(filters)]); };
  const enable = async (id,value=true) => { await as(0); return rpc('set_my_filter_set_notifications',[id,value]); };
  const publish = async (patch={},id=null,owner=1) => { await as(owner); return rpc('save_my_trip',[JSON.stringify({...trip,...patch}),id,false,randomUUID()]); };
  const process = async (close=false) => {
    await root();
    if (close) await db.exec("update notifications_private.filter_alert_batches set due_at=now()-interval '1 second' where finalized_at is null");
    await db.exec('set role service_role'); return rpc('process_filter_notifications',[10]);
  };
  const inbox = async () => { await as(0); return (await rpc('get_my_notifications')).items.filter(n=>n.kind==='saved_filter'); };
  const claim = async () => { await root(); await db.exec('set role service_role'); return (await db.query('select * from public.claim_push_deliveries(100)')).rows.filter(n=>n.kind==='saved_filter'); };
  const scenario = async (name,fn) => t.test(name,async () => { await root(); await db.exec('begin'); inScenario=true; try {await fn();}finally{inScenario=false;await db.exec('rollback');await root();} });
  try {
    await db.query('insert into auth.users values($1),($2),($3)',users);
    for(let i=0;i<3;i++){await as(i);groups.push((await rpc('save_my_profile',[JSON.stringify(profile('Ekipa '+i))])).group.id);}
    await as(0);
    await rpc('register_my_push_device',[randomUUID(),randomUUID(),'ExponentPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    await scenario('off by default; no own trip needed; historical and resumed publications are never replayed',async()=>{
      const s=await set(); assert.equal(s.notifications_enabled,false);
      const old=await publish(); await enable(s.id); await publish({},old.id); await process(true);
      assert.deepEqual(await inbox(),[]);
      const fresh=await publish(); await process(); assert.deepEqual(await inbox(),[]);
      await process(true); const entries=await inbox(); assert.equal(entries.length,1); assert.equal(entries[0].filter_set_id,s.id);
      assert.equal(entries[0].filter_result_count,1); assert.equal(entries[0].available,true);
      await publish({},fresh.id); await process(true); assert.equal((await inbox()).length,1);
    });
    await scenario('several publications form one immutable digest; retries and other sets remain independent',async()=>{
      const a=await set(),b=await set({},'trips',randomUUID(),'Drugi'); await enable(a.id); await enable(b.id);
      await publish(); await publish({},null,2); await process(); await process(); assert.deepEqual(await inbox(),[]);
      await process(true); let entries=await inbox(); assert.equal(entries.length,2); assert.ok(entries.every(n=>n.filter_result_count===2));
      const jobs=await claim(); assert.equal(jobs.length,2); assert.ok(jobs.every(j=>j.proposal_count===2&&j.notification_id===j.event_id&&j.filter_set_id));
      await process(true); assert.equal((await inbox()).length,2);
      await root(); await db.exec("update notifications_private.filter_alert_batches set window_start=window_start-interval '10 minutes'");
      await publish(); await process(); await process(true);
      entries=await inbox(); assert.equal(entries.length,4); assert.equal(entries.reduce((sum,n)=>sum+n.filter_result_count,0),6);
    });
    await scenario('matching reuses discovery for dates, tolerance, profile kind, trip children, animals, mode, place and landscape',async()=>{
      const s=await set({trip_modes:['planned'],group_kinds:['family'],child_age_bands:['4–6'],animal_kinds:['dog'],landscapes:['coast'],
        location_query:'Chłapowo',start_date:'2099-05-25',end_date:'2099-05-28',tolerance_days:2});
      await enable(s.id);
      await publish({animal_kinds:['dog']});
      await publish({animal_kinds:['cat']}); await publish({animal_kinds:['dog'],landscape:'forest'});
      await publish({animal_kinds:['dog'],child_age_bands:['7–9']});
      await process(true); await process(true);
      const entries=await inbox(); assert.equal(entries.length,1);assert.equal(entries[0].filter_result_count,1);
    });
    await scenario('favorite-only does not widen results and no alerts appear for own, private, hidden or blocked trips',async()=>{
      const s=await set({favorites_only:true});await enable(s.id);const p=await publish();await process(true);assert.deepEqual(await inbox(),[]);
      await as(0);await rpc('set_my_trip_favorite',[p.id,true]);await process(true);assert.deepEqual(await inbox(),[]);
      const all=await set({},'trips',randomUUID(),'Wszystko');await enable(all.id);
      await publish({},null,0);await publish({visibility:'private'}); const hidden=await publish(); const blocked=await publish({},null,2);
      await root();await query('insert into moderation_private.hidden_trips(trip_id) values($1)',[hidden.id]);
      await as(0);await rpc('set_group_block',[groups[2],true]);await process(true);assert.deepEqual(await inbox(),[]);
      assert.ok(blocked.id);
    });
    await scenario('disabling, re-enabling and replacing criteria cancel queued work and do not replay existing trips',async()=>{
      const s=await set();await enable(s.id);await publish();await process();await enable(s.id,false);await process(true);assert.deepEqual(await inbox(),[]);
      await enable(s.id);await process(true);assert.deepEqual(await inbox(),[]);
      await publish();await process();await set({landscapes:['forest']},'trips',s.id);await process(true);assert.deepEqual(await inbox(),[]);
      await publish({landscape:'forest'});await process();await process(true);assert.equal((await inbox()).length,1);
    });
    await scenario('rename preserves subscription; expired sets and crew sets cannot enable alerts',async()=>{
      const s=await set();await enable(s.id);await as(0);const before=(await rpc('list_my_filter_sets'))[0];
      const renamed=await rpc('save_my_filter_set',[s.id,'trips','Nowa nazwa',null]);assert.equal(renamed.notifications_enabled,true);assert.equal(renamed.alert_generation,before.alert_generation);
      const old=await set({start_date:'2000-01-01',end_date:'2000-01-02'},'trips',randomUUID(),'Dawny');
      await assert.rejects(enable(old.id),e=>e.code==='22023');
      const crew=await set({},'groups');await assert.rejects(enable(crew.id),e=>e.code==='22023');
    });
    await scenario('global push preference preserves in-app digests; old categories remain independently controlled',async()=>{
      const s=await set();await enable(s.id);await as(0);await rpc('save_my_notification_preference',['saved_filters',false]);
      await rpc('save_my_notification_preference',['messages',false]);
      const prefs=(await rpc('get_my_notifications')).preferences;assert.equal(prefs.push_saved_filters,false);assert.equal(prefs.push_messages,false);assert.equal(prefs.push_proposals,true);
      await publish();await process();await process(true);assert.equal((await inbox()).length,1);assert.deepEqual(await claim(),[]);
      await as(0);await rpc('save_my_notification_preference',['saved_filters',true]);assert.deepEqual(await claim(),[]);
    });
    for (const reason of ['disable','replace','delete','global preference','private trip','expired session'])
      await scenario('pending digest is cancelled or rejected after '+reason,async()=>{
        const s=await set();await enable(s.id);const p=await publish();await process();await process(true);
        await root();assert.equal((await query("select count(*)::int n from push_private.deliveries d join push_private.events e on e.id=d.event_id where e.kind='saved_filter' and d.status='pending'")).rows[0].n,1);
        if(reason==='disable')await enable(s.id,false);
        if(reason==='replace')await set({landscapes:['forest']},'trips',s.id);
        if(reason==='delete'){await as(0);await rpc('delete_my_filter_set',[s.id]);}
        if(reason==='global preference'){await as(0);await rpc('save_my_notification_preference',['saved_filters',false]);}
        if(reason==='private trip')await publish({visibility:'private'},p.id);
        if(reason==='expired session'){await root();await query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[users[0]]);}
        assert.deepEqual(await claim(),[]);
      });
    await scenario('delivery rechecks read state, blocking, current match, deletion and account/session access',async()=>{
      const s=await set();await enable(s.id);const p=await publish();await process();await process(true);
      const entry=(await inbox())[0];await as(0);await rpc('mark_my_notifications_read',[[entry.id],null]);assert.deepEqual(await claim(),[]);
      await root();await db.query('update public.notifications set read_at=null where id=$1',[entry.id]);
      await as(0);await rpc('set_group_block',[groups[1],true]);assert.equal((await inbox())[0].available,false);assert.deepEqual(await claim(),[]);
      await as(0);await rpc('delete_my_filter_set',[s.id]);assert.equal((await inbox())[0].filter_set_id,null);assert.equal((await inbox())[0].available,false);
      assert.ok(p.id);
    });
    await scenario('other users and anonymous callers cannot change subscriptions or invoke the processor',async()=>{
      const s=await set();await as(1);await assert.rejects(rpc('set_my_filter_set_notifications',[s.id,true]),e=>e.code==='P0002');
      await assert.rejects(rpc('process_filter_notifications',[10]));await assert.rejects(query('select * from notifications_private.filter_alert_batches'));
      await root();await db.exec('set role anon');await assert.rejects(rpc('set_my_filter_set_notifications',[s.id,true]));
      await as(0);await root();await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[users[0]]);
      await as(0);await assert.rejects(rpc('set_my_filter_set_notifications',[s.id,true]),e=>e.code==='42501');
    });
    await scenario('deleting an account with digests cascades private alert data and pending deliveries',async()=>{
      const s=await set();await enable(s.id);await publish();await process();await process(true);assert.equal((await inbox()).length,1);
      await root();await query('delete from auth.users where id=$1',[users[0]]);
      assert.equal((await query('select count(*)::int n from discovery_private.saved_filter_sets')).rows[0].n,0);
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_batches')).rows[0].n,0);
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_seen')).rows[0].n,0);
    });
    await scenario('a publication matching over 200 sets resumes next tick without losing or duplicating results',async()=>{
      for(let i=0;i<21;i++){
        const user=randomUUID();await root();await query('insert into auth.users values($1)',[user]);await asUser(db,user);
        const crew=(await rpc('save_my_profile',[JSON.stringify(profile('Obserwujący '+i))])).group.id;
        await root();await query(`insert into discovery_private.saved_filter_sets(id,owner_group_id,kind,name,filters,notifications_enabled,alerts_started_at)
          select gen_random_uuid(),$1,'trips','Zestaw '||n,discovery_private.filter_set_payload('trips','{}'::jsonb,$1),true,clock_timestamp() from generate_series(1,10)n`,[crew]);
      }
      await publish();await process();await root();
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_seen')).rows[0].n,200);
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_jobs')).rows[0].n,1);
      await process();await root();
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_seen')).rows[0].n,210);
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_jobs')).rows[0].n,0);
      await process();await root();
      assert.equal((await query('select count(*)::int n from notifications_private.filter_alert_items')).rows[0].n,210);
    });
  } finally {await db.close();}
});
