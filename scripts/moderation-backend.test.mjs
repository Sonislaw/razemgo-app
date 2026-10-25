import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
test('moderation: privileged access, evidence, reversible decisions, old sessions and audit',async t=>{
  const db=new PGlite();const users=[randomUUID(),randomUUID(),randomUUID()],sessions=users.map(()=>randomUUID()),groups=[];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    for (const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql','202610240003_messaging.sql','202610240004_push_notifications.sql','202610240005_notification_center.sql','202610240006_push_health.sql','202610240007_moderation.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const admin=()=>db.exec('reset role');
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[users[i],sessions[i]]);};
    for (let i=0;i<3;i++) {
      await admin();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],users[i]]);
      await as(i);groups.push((await one('select public.save_my_profile($1) as value',[{name:['Moderator','Reported crew','Reporting crew'][i],avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}])).group.id);
    }
    await admin();await db.query('insert into moderation_private.administrators(user_id) values($1)',[users[0]]);
    const plan={mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'test',location_name:'Test',location_region:'Test',location_kind:'village',travel_mode:'Kamper',description:'Original description saved as evidence.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]};
    await as(1);const trip=await one('select public.save_my_trip($1) as value',[plan]);
    await as(2);const key=randomUUID(),report=await one('select public.report_trip($1,$2,$3) as value',[trip.id,'Spam',key]);
    const detail=()=>one('select public.admin_report_detail($1) as value',[report]);
    const apply=async(action,note='Verified by moderator',request=randomUUID(),version)=>one('select public.admin_apply_action($1,$2,$3,$4,$5) as value',[report,action,note,request,version??(await detail()).report.updated_at]);
    await t.test('reports are idempotent and ordinary clients cannot grant privileges or read evidence',async()=>{
      assert.equal(await one('select public.report_trip($1,$2,$3) as value',[trip.id,'Spam',key]),report);
      await assert.rejects(detail(),e=>e.code==='42501');await assert.rejects(db.query('select * from moderation_private.administrators'));
      await assert.rejects(db.query('insert into moderation_private.administrators values($1,now())',[users[2]]));
      await assert.rejects(db.query('select * from public.account_reports'));
      assert.equal((await one('select public.get_my_account_access() as value')).is_admin,false);
      await as(1);await assert.rejects(one('select public.report_trip($1,$2,$3) as value',[trip.id,'Spam',randomUUID()]));
      await db.exec('reset role;set role anon');await assert.rejects(detail());await assert.rejects(db.query('select public.get_my_account_access()'));
      await as(0);assert.equal((await one('select public.get_my_account_access() as value')).is_admin,true);
    });
    await t.test('the queue omits evidence; detail keeps the original snapshot after the owner edits',async()=>{
      await as(1);await one('select public.save_my_trip($1,$2) as value',[{...plan,description:'Different description after a report.'},trip.id]);
      await as(0);const page=await one('select public.admin_list_reports() as value');assert.equal(page.counts.new,1);assert.equal(page.items[0].evidence,undefined);
      assert.equal((await detail()).evidence.trip.description,plan.description);
      const filtered=await one('select public.admin_list_reports($1,$2) as value',['open','reported']);assert.equal(filtered.items.length,1);
    });
    await t.test('notes, optimistic concurrency and idempotency protect decisions and their audit',async()=>{
      const initial=await detail();await assert.rejects(apply('close','no'),e=>e.code==='22023');
      const request=randomUUID(),saved=await apply('in_progress',undefined,request);assert.equal(saved.report.status,'in_progress');assert.equal(saved.history.length,1);
      const retry=await apply('in_progress',undefined,request,initial.report.updated_at);assert.equal(retry.history.length,1);
      await assert.rejects(apply('close',undefined,randomUUID(),initial.report.updated_at),e=>e.code==='40001');
      assert.equal((await apply('close')).report.status,'closed');assert.equal((await apply('reopen')).report.status,'new');
    });
    await t.test('hiding is enforced for discovery, new contact and owner edits; restoring is reversible',async()=>{
      await apply('hide_trip');await as(2);assert.equal((await db.query('select * from public.list_public_trips($1)',[trip.id])).rows.length,0);
      await assert.rejects(one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Hello there',randomUUID()]),e=>e.code==='P0002');
      await as(1);assert.deepEqual((await one('select public.get_my_account_access() as value')).hidden_trip_ids,[trip.id]);
      await one('select public.save_my_trip($1,$2) as value',[plan,trip.id]);await assert.rejects(db.query('delete from moderation_private.hidden_trips'));
      await as(0);assert.equal((await apply('restore_trip')).trip_hidden,false);
      await as(2);assert.equal((await db.query('select * from public.list_public_trips($1)',[trip.id])).rows.length,1);
    });
    await as(2);const invite=await one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Evidence invitation',randomUUID()]);
    await as(1);const chat=await one('select public.respond_contact_invitation($1,$2) as value',[invite,'accepted']);
    await one('select public.send_chat_message($1,$2,$3) as value',[chat,'Reported message',randomUUID()]);
    await as(2);const conversationReport=await one('select public.report_conversation($1,$2,$3) as value',[chat,'Niewłaściwe treści',randomUUID()]);
    await t.test('moderators see only the captured conversation evidence, not unrestricted message history',async()=>{
      await as(1);await one('select public.send_chat_message($1,$2,$3) as value',[chat,'Later private message outside evidence',randomUUID()]);
      await as(0);const data=await one('select public.admin_report_detail($1) as value',[conversationReport]);
      assert.equal(data.evidence.messages.length,2);assert.equal(JSON.stringify(data).includes('Later private'),false);
      await assert.rejects(db.query('select * from public.get_conversation_messages($1)',[chat]),e=>e.code==='42501');
    });
    await t.test('suspension immediately blocks existing sessions in RLS, RPCs, messages and notifications',async()=>{
      await as(0);assert.equal((await apply('suspend_account')).account_suspended,true);
      await as(1);assert.equal((await one('select public.get_my_account_access() as value')).suspended,true);
      assert.equal((await db.query('select * from public.travel_groups')).rows.length,0);assert.equal((await db.query('select * from public.trip_plans')).rows.length,0);
      for (const [sql,args] of [['select public.save_my_trip($1,$2)',[plan,trip.id]],['select public.send_chat_message($1,$2,$3)',[chat,'Blocked message',randomUUID()]],['select public.get_my_mailbox()',[]],['select public.get_my_notifications()',[]]]) await assert.rejects(db.query(sql,args));
      await as(2);await assert.rejects(db.query('select public.send_chat_message($1,$2,$3)',[chat,'Contact with suspended crew',randomUUID()]),e=>e.code==='42501');
      assert.equal((await db.query('select * from public.list_public_trips($1)',[trip.id])).rows.length,0);
      await as(0);await apply('restore_account');await as(1);assert.equal((await db.query('select * from public.travel_groups')).rows.length,1);
      await one('select public.send_chat_message($1,$2,$3) as value',[chat,'Contact restored',randomUUID()]);
    });
    await t.test('revocation takes effect without refreshing JWT and audit cannot be changed by an admin client',async()=>{
      await as(0);await assert.rejects(db.query('delete from moderation_private.audit_log'));
      await admin();await db.query('delete from moderation_private.administrators where user_id=$1',[users[0]]);
      await as(0);assert.equal((await one('select public.get_my_account_access() as value')).is_admin,false);await assert.rejects(detail(),e=>e.code==='42501');
      await admin();await db.query('insert into moderation_private.administrators(user_id) values($1)',[users[0]]);
    });
    await t.test('an administrator cannot suspend their own account or another administrator',async()=>{
      await as(0);const ownTrip=await one('select public.save_my_trip($1) as value',[plan]);
      await as(2);const ownReport=await one('select public.report_trip($1,$2,$3) as value',[ownTrip.id,'Spam',randomUUID()]);
      await as(0);const ownDetail=await one('select public.admin_report_detail($1) as value',[ownReport]);assert.equal(ownDetail.can_suspend,false);
      await assert.rejects(db.query('select public.admin_apply_action($1,$2,$3,$4,$5)',[ownReport,'suspend_account','A forbidden self-suspension',randomUUID(),ownDetail.report.updated_at]),e=>e.code==='42501');
      await admin();await db.query('insert into moderation_private.administrators(user_id) values($1)',[users[1]]);
      await as(0);assert.equal((await detail()).can_suspend,false);await assert.rejects(apply('suspend_account'),e=>e.code==='42501');
      await admin();await db.query('delete from moderation_private.administrators where user_id=$1',[users[1]]);
    });
    await t.test('stable cursor pagination does not duplicate reports sharing a timestamp',async()=>{
      await admin();await db.query(`insert into public.account_reports(reporter_group_id,reported_group_id,trip_id,target_kind,reason,request_key,evidence,created_at)
        select $1,$2,$3,'trip','Spam',gen_random_uuid(),'{}','2026-01-01T12:00:00Z' from generate_series(1,30)`,[groups[2],groups[1],trip.id]);
      const total=Number(await one('select count(*) as value from public.account_reports'));
      await as(0);const first=await one('select public.admin_list_reports($1) as value',['all']);assert.equal(first.items.length,25);assert.equal(first.has_more,true);
      const cursor=first.items.at(-1),second=await one('select public.admin_list_reports($1,$2,$3,$4) as value',['all','',cursor.created_at,cursor.id]);
      assert.equal(second.has_more,false);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,total);
    });
  } finally {await db.close();}
});
