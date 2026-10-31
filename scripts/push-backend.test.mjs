import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const [A,B,C]=[randomUUID(),randomUUID(),randomUUID()];
const sessions={[A]:randomUUID(),[B]:randomUUID(),[C]:randomUUID()};
const project='b7305e7b-7e1c-4b12-9123-caa0587f49b0';
const profile={name:'Ekipa',avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}};
const plan={adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'test',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'',campground_address:'',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i ognisko.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]};
const device=()=>({id:randomUUID(),key:randomUUID(),token:'ExponentPushToken['+randomUUID().replaceAll('-','')+']'});

test('push outbox: three event types, consent, session binding, leases, retries and isolation',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}');
      insert into auth.sessions(id,user_id) values('${sessions[A]}','${A}'),('${sessions[B]}','${B}'),('${sessions[C]}','${C}');`);
    for(const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql','202610240003_messaging.sql','202610240004_push_notifications.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const as=id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.session_id','${sessions[id]}',false);`);
    const admin=()=>db.exec('reset role');
    const service=()=>db.exec('reset role;set role service_role');
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const groups={};
    for(const id of [A,B,C]){await as(id);groups[id]=(await one('select public.save_my_profile($1) as value',[JSON.stringify(profile)])).group.id;}
    const register=(d,patch={})=>one('select public.register_my_push_device($1,$2,$3,$4,$5) as value',[d.id,d.key,patch.token??d.token,patch.platform??'android',patch.project??project]);
    const unregister=d=>db.query('select public.unregister_my_push_device($1,$2)',[d.id,d.key]);
    const claim=async()=>{await service();return (await db.query('select * from public.claim_push_deliveries(30)')).rows;};
    const finish=(job,result,ticket=null,token=job.push_token,lease=job.claim_key)=>db.query('select public.finish_push_delivery($1,$2,$3,$4,$5,$6)',[job.delivery_id,lease,result,token,ticket,null]);
    const forceDue=async()=>{await admin();await db.exec("update push_private.deliveries set due_at=now()-interval '1 second'");};
    const a1=device(),a2=device(),b1=device();
    await t.test('registration requires a real current session and validates platform/project/token',async()=>{
      await as(A);await register(a1);await register(a1);await register(a2);
      await assert.rejects(register({...a1,key:randomUUID()}));
      await assert.rejects(register(device(),{project:randomUUID()}));
      await assert.rejects(register(device(),{platform:'web'}));
      await assert.rejects(register(device(),{token:'not-a-token'}));
      await db.exec("select set_config('request.jwt.claim.session_id','',false)");await assert.rejects(register(device()));
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)",[sessions[B]]);await assert.rejects(register(device()));
      await as(B);await register(b1);
      await assert.rejects(register({...a1,key:randomUUID()}));
      await assert.rejects(db.query('select * from public.push_devices'));
      await assert.rejects(db.query('select * from push_private.events'));
      await assert.rejects(db.query('select * from public.claim_push_deliveries(30)'));
    });
    await as(A);const trip=await one('select public.save_my_trip($1) as value',[JSON.stringify(plan)]);
    await as(B);const inviteKey=randomUUID();
    const invite=()=>one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Cześć, spotkajmy się!',inviteKey]);
    const invitation=await invite();await invite();
    let firstJobs;
    await t.test('one received-invitation event fans out only to recipient devices, not sender or future installs',async()=>{
      await admin();const events=(await db.query('select * from push_private.events')).rows;
      assert.equal(events.length,1);assert.equal(events[0].kind,'invitation_received');
      firstJobs=await claim();assert.equal(firstJobs.length,2);
      assert.ok(firstJobs.every(j=>j.recipient_group_id===groups[A]));
      assert.deepEqual(new Set(firstJobs.map(j=>j.device_id)),new Set([a1.id,a2.id]));
      assert.equal((await claim()).length,0);
      await as(C);await register(device());
      await admin();assert.equal((await db.query('select * from push_private.deliveries')).rows.length,2);
    });
    await t.test('leases protect concurrent workers and stale completion cannot overwrite newer work',async()=>{
      await finish(firstJobs[0],'ticket','ticket-1');await finish(firstJobs[1],'retry');
      assert.equal((await claim()).length,0);
      await forceDue();const jobs=await claim();assert.equal(jobs.length,2);
      assert.equal(jobs.find(j=>j.ticket_id)?.ticket_id,'ticket-1');
      const retry=jobs.find(j=>!j.ticket_id);assert.ok(retry);assert.notEqual(retry.claim_key,firstJobs[1].claim_key);
      await finish(retry,'failed',null,retry.push_token,firstJobs[1].claim_key);
      await admin();assert.equal((await db.query('select status from push_private.deliveries where id=$1',[retry.delivery_id])).rows[0].status,'sending');
      await service();await finish(retry,'ticket','ticket-2');await finish(jobs.find(j=>j.ticket_id),'sent');
    });
    await as(A);const chat=await one('select public.respond_contact_invitation($1,$2) as value',[invitation,'accepted']);
    await t.test('acceptance queues one alert to the sender; copied invitation text is not another message alert',async()=>{
      await as(A);await one('select public.respond_contact_invitation($1,$2)',[invitation,'accepted']);
      await admin();const events=(await db.query('select kind from push_private.events order by created_at,id')).rows;
      assert.equal(events.filter(e=>e.kind==='invitation_accepted').length,1);
      assert.equal(events.filter(e=>e.kind==='message').length,0);
      const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].recipient_group_id,groups[B]);
      await finish(jobs[0],'sent');
      await forceDue();assert.equal((await claim()).length,0); // stale pending invitation no longer gets sent
    });
    const send=async(text,requestKey=randomUUID())=>one('select public.send_chat_message($1,$2,$3) as value',[chat,text,requestKey]);
    await t.test('message retry enqueues once, and reading before dispatch suppresses the obsolete alert',async()=>{
      await as(A);const key=randomUUID();const message=await send('Pierwsza prawdziwa wiadomość',key);await send('Pierwsza prawdziwa wiadomość',key);
      await admin();assert.equal((await db.query("select * from push_private.events where kind='message'")).rows.length,1);
      await as(B);await db.query('select public.mark_conversation_read($1,$2)',[chat,message.id]);
      assert.equal((await claim()).length,0);
    });
    await t.test('blocking either side suppresses queued alerts as well as future contact',async()=>{
      await as(A);await send('Jeszcze jedna wiadomość');
      await as(B);await db.query('select public.set_group_block($1,true)',[groups[A]]);
      assert.equal((await claim()).length,0);
      await as(B);await db.query('select public.set_group_block($1,false)',[groups[A]]);
    });
    await t.test('invalid-token results disable only the exact token, never its replacement',async()=>{
      await as(A);await send('Wiadomość do nowego tokena');const [job]=await claim();assert.equal(job.device_id,b1.id);
      const rotated='ExpoPushToken['+randomUUID().replaceAll('-','')+']';
      await as(B);await register(b1,{token:rotated});await service();await finish(job,'invalid');
      await admin();assert.equal((await db.query('select expo_push_token from public.push_devices where id=$1',[b1.id])).rows[0].expo_push_token,rotated);
      await as(A);await send('Wiadomość do nieaktualnego urządzenia');const [current]=await claim();await finish(current,'invalid');
      await admin();assert.equal((await db.query('select * from public.push_devices where id=$1',[b1.id])).rows.length,0);
    });
    await t.test('changing accounts removes old queued deliveries; a wrong installation key cannot move the device',async()=>{
      await as(B);await register(b1);await send('Wiadomość dla A');
      await as(C);await assert.rejects(register({...a1,key:randomUUID()}));
      await as(C);await register(a1);
      await admin();assert.equal((await db.query('select * from push_private.deliveries d join push_private.events e on e.id=d.event_id where d.device_id=$1 and e.recipient_group_id<>$2',[a1.id,groups[C]])).rows.length,0);
      await as(A);await unregister(a1); // A can no longer unregister C's binding
      await admin();assert.equal((await db.query('select group_id from public.push_devices where id=$1',[a1.id])).rows[0].group_id,groups[C]);
    });
    await t.test('notification infrastructure failures never roll back a message',async()=>{
      await admin();await db.exec("create or replace function push_private.wake_dispatcher() returns void language plpgsql as $$begin raise exception 'Offline dispatcher';end$$;");
      await as(A);const sent=await send('Wiadomość działa mimo awarii wysyłki powiadomień');assert.ok(sent.id);
    });
    await t.test('unregistration, logout, and account deletion cascade tokens and queued work',async()=>{
      await as(A);await unregister(a2);await admin();assert.equal((await db.query('select * from public.push_devices where id=$1',[a2.id])).rows.length,0);
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[B]]);
      await as(B);await assert.rejects(register(device()));assert.equal((await claim()).length,0);
      await admin();
      await db.query('delete from auth.sessions where id=$1',[sessions[B]]);
      assert.equal((await db.query('select * from public.push_devices where group_id=$1',[groups[B]])).rows.length,0);
      await as(B);await assert.rejects(register(device()));
      await admin();await db.query('delete from auth.users where id=$1',[C]);
      assert.equal((await db.query('select * from public.push_devices where group_id=$1',[groups[C]])).rows.length,0);
      await db.exec('set role anon');await assert.rejects(db.query('select public.claim_push_deliveries(30)'));
      await assert.rejects(register(device()));await assert.rejects(db.query('select * from public.push_devices'));
    });
  }finally{await db.close();}
});
