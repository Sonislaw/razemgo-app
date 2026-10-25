import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('push health SQL: privacy, scheduler detection, due dates and durable incident leases',async t=>{
  const db=new PGlite();
  const users=[randomUUID(),randomUUID()],sessions=users.map(()=>randomUUID());
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;
      create schema cron;
      create table cron.job(jobid bigint primary key,jobname text,active boolean,schedule text,command text);
      create table cron.job_run_details(jobid bigint,status text,end_time timestamptz);
      insert into cron.job values(1,'razemgo-dispatch-push',true,'* * * * *','private command'),(2,'razemgo-monitor-push',true,'*/5 * * * *','private command');
      insert into cron.job_run_details values(1,'succeeded',now());`);
    for (const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql','202610240003_messaging.sql','202610240004_push_notifications.sql','202610240005_notification_center.sql','202610240006_push_health.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const admin=()=>db.exec('reset role');
    const service=()=>db.exec('reset role;set role service_role');
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const as=async i=>{
      await db.exec('reset role;set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[users[i],sessions[i]]);
    };
    const snapshot=async()=>{await service();return one('select public.get_push_health() as value');};
    const claims=async codes=>{await service();return (await db.query('select * from public.claim_push_health_alerts($1)',[codes])).rows;};
    const finish=async(code,lease,accepted)=>{await service();await db.query('select public.finish_push_health_alert($1,$2,$3)',[code,lease,accepted]);};
    await t.test('an empty system is healthy and cron command text never leaves the database',async()=>{
      const state=await snapshot();assert.equal(state.pending,0);assert.equal(state.dispatcher_schedule_ok,true);assert.equal(state.monitor_schedule_ok,true);
      assert.equal(state.dispatcher_tick_ok,true);assert.equal(JSON.stringify(state).includes('private'),false);
    });
    for (let i=0;i<2;i++) {
      await admin();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],users[i]]);
      await as(i);await one('select public.save_my_profile($1) as value',[{name:'Health crew',avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}]);
    }
    await as(0);await one('select public.register_my_push_device($1,$2,$3,$4,$5)',[randomUUID(),randomUUID(),'ExpoPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    const trip=await one('select public.save_my_trip($1) as value',[{mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'health',location_name:'Test',location_kind:'village',location_region:'Test',travel_mode:'Kamper',description:'A fictional trip for a health check.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]}]);
    await as(1);await one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Private health invitation',randomUUID()]);
    await t.test('normal receipt wait and backoff are not stale; genuinely overdue work is visible',async()=>{
      assert.equal((await snapshot()).pending,1);
      await admin();await db.exec("update push_private.deliveries set status='ticketed',ticket_id='ticket',attempts=4,error_code='ReceiptPending',due_at=now()+interval '15 minutes'");
      let state=await snapshot();assert.equal(state.awaiting_receipts,1);assert.equal(state.overdue,0);assert.equal(state.retrying,0);
      await admin();await db.exec("update push_private.deliveries set due_at=now()-interval '11 minutes'");
      assert.equal((await snapshot()).overdue,1);
      await admin();await db.exec("update push_private.deliveries set status='checking',claimed_at=now()-interval '11 minutes'");
      assert.equal((await snapshot()).overdue,1);
      await admin();await db.exec("update push_private.events set expires_at=now()-interval '1 minute'");
      state=await snapshot();assert.equal(state.overdue,0);assert.equal(state.in_flight,0);
      await admin();await db.exec("update push_private.events set expires_at=now()+interval '24 hours'");
    });
    await t.test('credentials and exhausted retries use bounded recent counters without returning provider payloads',async()=>{
      await admin();await db.exec("update push_private.deliveries set status='pending',attempts=4,error_code='InvalidCredentials',due_at=now()+interval '1 hour'");
      let state=await snapshot();assert.equal(state.credential_errors,1);assert.equal(state.retrying,1);
      await admin();await db.exec("update push_private.deliveries set outcome_at=now()-interval '2 hours'");
      assert.equal((await snapshot()).credential_errors,0);
      await admin();await db.exec("update push_private.deliveries set status='failed',error_code='private provider text'");
      state=await snapshot();assert.equal(state.failed_recent,1);assert.equal(JSON.stringify(state).includes('private'),false);
      await admin();await db.exec("update push_private.deliveries set status='skipped',error_code='PreferenceDisabled'");
    });
    await t.test('disabled or changed schedules and missing successful ticks are detected even with no queued work',async()=>{
      await admin();await db.exec("update cron.job set active=false where jobid=1;update push_private.health_state set installed_at=now()-interval '1 day';update cron.job_run_details set end_time=now()-interval '11 minutes'");
      let state=await snapshot();assert.equal(state.dispatcher_schedule_ok,false);assert.equal(state.dispatcher_tick_ok,false);
      await admin();await db.exec("update cron.job set active=true;update cron.job set schedule='* * * * *' where jobid=2");
      assert.equal((await snapshot()).monitor_schedule_ok,false);
      await admin();await db.exec("update cron.job set schedule='*/5 * * * *' where jobid=2;insert into cron.job_run_details values(1,'succeeded',now())");
      state=await snapshot();assert.equal(state.dispatcher_schedule_ok,true);assert.equal(state.monitor_schedule_ok,true);assert.equal(state.dispatcher_tick_ok,true);
    });
    await t.test('claims survive new calls, reject stale completion and cool down only after accepted reports',async()=>{
      const [first]=await claims(['PUSH_CREDENTIALS']);assert.ok(first.lease);
      assert.deepEqual(await claims(['PUSH_CREDENTIALS']),[]);
      await finish(first.code,randomUUID(),true);
      await admin();assert.equal(await one("select last_reported_at is null as value from push_private.health_alerts where code='PUSH_CREDENTIALS'"),true);
      await finish(first.code,first.lease,true);assert.deepEqual(await claims(['PUSH_CREDENTIALS']),[]);
      await admin();await db.exec("update push_private.health_alerts set last_reported_at=now()-interval '61 minutes',last_attempted_at=now()-interval '6 minutes' where code='PUSH_CREDENTIALS'");
      const [second]=await claims(['PUSH_CREDENTIALS']);assert.notEqual(second.lease,first.lease);
      await finish(second.code,first.lease,true);await finish(second.code,second.lease,false);
      await admin();assert.equal(await one("select last_reported_at<now()-interval '1 hour' as value from push_private.health_alerts where code='PUSH_CREDENTIALS'"),true);
      assert.deepEqual(await claims(['PUSH_CREDENTIALS']),[]);
      await admin();await db.exec("update push_private.health_alerts set last_attempted_at=now()-interval '6 minutes' where code='PUSH_CREDENTIALS'");
      const [third]=await claims(['PUSH_CREDENTIALS']);assert.ok(third.lease);
      await claims([]);const [newIncident]=await claims(['PUSH_CREDENTIALS']);assert.notEqual(newIncident.lease,third.lease);
      await finish(third.code,third.lease,true);
      await admin();assert.equal(await one("select lease=$1 as value from push_private.health_alerts where code='PUSH_CREDENTIALS'",[newIncident.lease]),true);
      await assert.rejects(claims(['private-code']));
      const [crashed]=await claims(['PUSH_RETRIES']);
      await admin();await db.exec("update push_private.health_alerts set lease_until=now()-interval '1 minute',last_attempted_at=now()-interval '6 minutes' where code='PUSH_RETRIES'");
      const [recovered]=await claims(['PUSH_RETRIES']);assert.notEqual(recovered.lease,crashed.lease);
      await finish(crashed.code,crashed.lease,true);
      await admin();assert.equal(await one("select last_reported_at is null and lease=$1 as value from push_private.health_alerts where code='PUSH_RETRIES'",[recovered.lease]),true);
    });
    await t.test('anonymous and authenticated API roles cannot inspect or alter monitoring',async()=>{
      for (const role of ['anon','authenticated']) {
        await db.exec('reset role;set role '+role);
        for (const sql of ['select public.get_push_health()',"select * from public.claim_push_health_alerts('{}')","select public.finish_push_health_alert('PUSH_CREDENTIALS',gen_random_uuid(),true)",'select * from push_private.health_alerts','select * from push_private.health_state'])
          await assert.rejects(db.query(sql));
      }
    });
  } finally {await db.close();}
});
