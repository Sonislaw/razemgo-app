import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('proposal health: migration, durable age, cron failures, isolated access and shared alert leases',async t=>{
  const db=new PGlite(),users=[randomUUID(),randomUUID()];
  const migration='202610270003_proposal_health.sql';
  const profile={name:'Health crew',avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],
    travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:'PRIVATE_PROFILE'}};
  const plan={adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-25',location_id:'pl-locality:4259',
    location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',travel_mode:'Kamper',
    description:'PRIVATE_TRIP: spokojny wyjazd nad morze i wspólne wycieczki.',landscape:'coast',interests:[],animal_kinds:[],
    matching_group_kinds:[],matching_child_age_bands:[]};
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')&&f<migration).sort())
      await db.exec(await readFile(new URL(file,dir),'utf8'));
    const root=()=>db.exec('reset role');
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[i]]);};
    const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const publish=async(i,overrides={},id=null)=>{await as(i);return value('select public.save_my_trip($1,$2,false,$3) value',[{...plan,...overrides},id,randomUUID()]);};
    const service=()=>db.exec('reset role;set role service_role');
    const snapshot=async()=>{await service();return value('select public.get_push_health() value');};
    const claim=async codes=>{await service();return(await db.query('select * from public.claim_push_health_alerts($1)',[codes])).rows;};
    const scenario=async(name,action)=>t.test(name,async()=>{
      await root();await db.exec('begin');
      try{await db.exec('delete from notifications_private.proposal_jobs');await action();}
      finally{await db.exec('rollback');await root();}
    });
    for(let i=0;i<2;i++){
      await root();await db.query('insert into auth.users values($1)',[users[i]]);
      await as(i);await value('select public.save_my_profile($1) value',[{...profile,name:'Health crew '+i}]);
    }
    const existing=await publish(0);
    await root();await db.exec("update notifications_private.proposal_jobs set queued_at=now()-interval '11 minutes'");
    await db.exec(`create schema cron;
      create table cron.job(jobid bigint primary key,jobname text,active boolean,schedule text,command text);
      create table cron.job_run_details(jobid bigint,status text,end_time timestamptz);
      insert into cron.job values(1,'razemgo-dispatch-push',true,'* * * * *','PRIVATE_COMMAND'),
        (2,'razemgo-monitor-push',true,'*/5 * * * *','PRIVATE_COMMAND'),(3,'razemgo-proposals',true,'* * * * *','PRIVATE_COMMAND');
      insert into cron.job_run_details values(1,'succeeded',now()),(3,'succeeded',now());`);
    await db.exec(await readFile(new URL(migration,dir),'utf8'));
    await t.test('migration preserves the original queue age and never produces alerts or replays matches itself',async()=>{
      assert.equal(await value('select first_queued_at=queued_at value from notifications_private.proposal_jobs where trip_id=$1',[existing.id]),true);
      const data=await snapshot();assert.equal(data.proposal_pending,1);assert.equal(data.proposal_overdue,1);
      assert.equal(data.proposal_schedule_ok,true);assert.equal(data.proposal_tick_ok,true);assert.ok(data.last_proposal_tick);
      for(const key of['pending','awaiting_receipts','in_flight','overdue','retrying','failed_recent','credential_errors'])assert.equal(data[key],0);
      for(const text of['PRIVATE_COMMAND','PRIVATE_PROFILE','PRIVATE_TRIP',users[0],existing.id])assert.equal(JSON.stringify(data).includes(text),false);
      await root();assert.equal(await value('select count(*)::int value from public.notifications'),0);
      assert.equal(await value('select count(*)::int value from push_private.events'),0);
    });
    await scenario('healthy empty queues still check the scheduled processor',async()=>{
      const data=await snapshot();assert.equal(data.proposal_pending,0);assert.equal(data.proposal_overdue,0);
      assert.equal(data.proposal_schedule_ok,true);assert.equal(data.proposal_tick_ok,true);
    });
    await scenario('missing, disabled and incorrect cron schedules are distinguishable from processor progress',async()=>{
      for(const change of["update cron.job set active=false where jobid=3","update cron.job set active=true,schedule='*/2 * * * *' where jobid=3","delete from cron.job where jobid=3"]){
        await root();await db.exec(change);assert.equal((await snapshot()).proposal_schedule_ok,false);
      }
      await root();await db.exec('drop schema cron cascade');
      assert.equal((await snapshot()).proposal_schedule_ok,false);
    });
    await scenario('five-minute threshold and initial grace apply without considering failed or future cron runs successful',async()=>{
      await root();await db.exec("delete from cron.job_run_details where jobid=3");
      let data=await snapshot();assert.equal(data.proposal_tick_ok,true);assert.equal(data.last_proposal_tick,null);
      await root();await db.exec("update notifications_private.proposal_health_state set installed_at=now()-interval '5 minutes'");
      assert.equal((await snapshot()).proposal_tick_ok,true);
      await root();await db.exec("update notifications_private.proposal_health_state set installed_at=now()-interval '5 minutes 1 second'");
      assert.equal((await snapshot()).proposal_tick_ok,false);
      await root();await db.exec("insert into cron.job_run_details values(3,'failed',now()),(3,'succeeded',now()+interval '1 day')");
      assert.equal((await snapshot()).proposal_tick_ok,false);
      await root();await db.exec("insert into cron.job_run_details values(3,'succeeded',now()-interval '5 minutes 1 second')");
      assert.equal((await snapshot()).proposal_tick_ok,false);
      await root();await db.exec("insert into cron.job_run_details values(3,'succeeded',now()-interval '5 minutes')");
      data=await snapshot();assert.equal(data.proposal_tick_ok,true);assert.ok(data.last_proposal_tick);
    });
    await scenario('queue age remains stable through repeated user edits and the ten-minute boundary is exact',async()=>{
      await publish(0,{description:plan.description+' zmiana'},existing.id);
      await root();await db.exec("update notifications_private.proposal_jobs set first_queued_at=now()-interval '10 minutes'");
      assert.equal((await snapshot()).proposal_overdue,0);
      await root();await db.exec("update notifications_private.proposal_jobs set first_queued_at=first_queued_at-interval '1 second'");
      await publish(0,{description:plan.description+' kolejna zmiana'},existing.id);
      const data=await snapshot();assert.equal(data.proposal_pending,1);assert.equal(data.proposal_overdue,1);
      await root();assert.equal(await value('select queued_at>first_queued_at value from notifications_private.proposal_jobs where trip_id=$1',[existing.id]),true);
    });
    await scenario('bounded processing moves a large job without concealing its original wait',async()=>{
      for(let i=0;i<201;i++)await publish(1);
      await root();await db.query("insert into notifications_private.proposal_jobs(trip_id,queued_at,first_queued_at) values($1,now()-interval '1 minute',now()-interval '11 minutes')",[existing.id]);
      await service();const progress=await value('select public.process_proposal_notifications(1) value');assert.equal(progress.created,200);
      const data=await snapshot();assert.equal(data.proposal_overdue,1);
      await root();assert.equal(await value('select queued_at>first_queued_at value from notifications_private.proposal_jobs where trip_id=$1',[existing.id]),true);
    });
    await scenario('concurrent monitor claims share leases, retry only after five minutes and recover after resolution',async()=>{
      const codes=['PROPOSAL_SCHEDULE_INVALID','PROPOSAL_PROCESSOR_STOPPED','PROPOSAL_QUEUE_STALLED'];
      await service();
      const responses=await Promise.all([db.query('select * from public.claim_push_health_alerts($1)',[codes]),db.query('select * from public.claim_push_health_alerts($1)',[codes])]);
      assert.equal(responses.flatMap(r=>r.rows).length,3);
      const first=responses.flatMap(r=>r.rows).find(r=>r.code==='PROPOSAL_QUEUE_STALLED');
      await db.query('select public.finish_push_health_alert($1,$2,true)',[first.code,randomUUID()]);
      await root();assert.equal(await value('select last_reported_at is null value from push_private.health_alerts where code=$1',[first.code]),true);
      await service();await db.query('select public.finish_push_health_alert($1,$2,false)',[first.code,first.lease]);
      assert.deepEqual(await claim(codes),[]);
      await root();await db.query("update push_private.health_alerts set last_attempted_at=now()-interval '6 minutes' where code=$1",[first.code]);
      const retry=(await claim(codes)).find(r=>r.code===first.code);assert.ok(retry);
      await db.query('select public.finish_push_health_alert($1,$2,true)',[retry.code,retry.lease]);
      assert.deepEqual(await claim(codes),[]);
      await root();await db.query("update push_private.health_alerts set last_reported_at=now()-interval '61 minutes',last_attempted_at=now()-interval '6 minutes' where code=$1",[first.code]);
      assert.ok((await claim(codes)).some(r=>r.code===first.code));
      await claim([]);assert.equal((await claim(codes)).length,3);
      await assert.rejects(claim(['UNRECOGNIZED']));
    });
    await scenario('ordinary and anonymous accounts cannot inspect or mutate monitoring state',async()=>{
      for(const role of['anon','authenticated']){
        await root();await db.exec('set role '+role);
        for(const sql of['select public.get_push_health()',"select * from public.claim_push_health_alerts('{}')",'select * from notifications_private.proposal_health_state','select notifications_private.proposal_health()',"update notifications_private.proposal_jobs set first_queued_at=now()"]){
          await db.exec('savepoint denied');
          await assert.rejects(db.exec(sql),e=>e.code==='42501');await db.exec('rollback to denied;release denied');
        }
      }
    });
  }finally{await db.close();}
});
