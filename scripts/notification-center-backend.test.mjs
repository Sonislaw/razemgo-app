import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('durable notification inbox, ownership, receipts and push preferences', async t => {
  const db = new PGlite();
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const sessions = users.map(() => randomUUID());
  const groups = [];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    for (const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql','202610240003_messaging.sql','202610240004_push_notifications.sql','202610240005_notification_center.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    const as = async index => {
      await db.exec('reset role;set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[index], sessions[index]]);
    };
    const admin = () => db.exec('reset role');
    const one = async (sql, args = []) => (await db.query(sql,args)).rows[0]?.value;
    const inbox = (...args) => one('select public.get_my_notifications($1,$2,$3,$4) as value', [args[0]??null,args[1]??null,args[2]??30,args[3]??false]);
    const preference = (key,enabled) => one('select public.save_my_notification_preference($1,$2) as value',[key,enabled]);
    const read = ids => one('select public.mark_my_notifications_read($1) as value',[ids]);
    const claim = async () => { await db.exec('reset role;set role service_role'); return (await db.query('select * from public.claim_push_deliveries(30)')).rows; };
    for (let i=0;i<3;i++) {
      await admin();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[i],users[i]]);
      await as(i);
      const profile={name:'Ekipa '+i,avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}};
      groups.push((await one('select public.save_my_profile($1) as value',[profile])).group.id);
    }
    const plan={mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'test',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i ognisko.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]};
    await as(0);const trip=await one('select public.save_my_trip($1) as value',[plan]);
    await as(1);const invitation=await one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Spotkajmy się na wyjeździe!',randomUUID()]);
    await t.test('inbox is created with no push devices and contains no private message text',async()=>{
      await as(0);const data=await inbox();assert.equal(data.unread_count,1);assert.equal(data.items[0].kind,'invitation_received');
      assert.equal(data.items[0].actor_name,'Ekipa 1');assert.equal(data.items[0].text,undefined);assert.equal(data.items[0].child_age_bands,undefined);
      await admin();assert.equal(await one('select count(*)::int as value from push_private.events'),0);
    });
    await as(0);const chat=await one('select public.respond_contact_invitation($1,$2) as value',[invitation,'accepted']);
    const send = text => one('select public.send_chat_message($1,$2,$3) as value',[chat,text,randomUUID()]);
    await t.test('acceptance creates one entry and copied invitation text does not create a message alert',async()=>{
      await as(1);const data=await inbox();assert.equal(data.items.length,1);assert.equal(data.items[0].kind,'invitation_accepted');assert.equal(data.unread_count,1);
      await as(0);assert.equal((await inbox()).unread_count,0);
    });
    await t.test('direct reads, writes, RPCs and read IDs cannot cross account boundaries',async()=>{
      await as(1);const entry=(await inbox()).items[0];
      await as(2);assert.equal((await inbox()).items.length,0);
      assert.equal((await db.query('select * from public.notifications')).rows.length,0);
      assert.equal(await read([entry.id]),0);
      await assert.rejects(db.query('update public.notifications set recipient_group_id=$1',[groups[2]]));
      await assert.rejects(db.query('insert into public.notification_preferences(group_id) values($1)',[groups[0]]));
      await preference('messages',false);await as(1);assert.equal((await inbox()).preferences.push_messages,true);
      await db.exec('reset role;set role anon');await assert.rejects(inbox());await assert.rejects(db.query('select * from public.notifications'));
    });
    await as(1);const device=randomUUID();
    await one('select public.register_my_push_device($1,$2,$3,$4,$5) as value',[device,randomUUID(),'ExponentPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    await t.test('preferences persist independently per field and disabled push still creates inbox entries',async()=>{
      await as(1);await preference('messages',false);await preference('invitations',false);await preference('messages',true);
      let prefs=(await inbox()).preferences;assert.equal(prefs.push_messages,true);assert.equal(prefs.push_invitations,false);
      await preference('messages',false);await as(0);await send('Ta wiadomość pozostaje w historii.');
      await as(1);assert.equal((await inbox()).items.filter(n=>n.kind==='message').length,1);
      assert.equal((await claim()).length,0);
      await as(1);await assert.rejects(preference('unknown',true));await assert.rejects(preference('messages',null));
    });
    await t.test('disabling cancels queued push and re-enabling does not replay it',async()=>{
      await as(1);await preference('messages',true);await as(0);await send('Alert, który wyłączymy przed wysłaniem.');
      await as(1);await preference('messages',false);await preference('messages',true);
      assert.equal((await claim()).length,0);
      await as(0);await send('Nowy alert po ponownym włączeniu.');
      const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].recipient_group_id,groups[1]);
    });
    await t.test('inbox read persists across fetches but never fabricates a chat receipt',async()=>{
      await as(1);const entry=(await inbox()).items.find(n=>n.kind==='message');
      assert.equal(await read([entry.id]),1);assert.equal(await read([entry.id]),0);
      assert.ok((await inbox()).items.find(n=>n.id===entry.id).read_at);
      assert.equal(await one('select last_read_sequence::int as value from public.conversation_reads where conversation_id=$1 and group_id=$2',[chat,groups[1]]),0);
      const unread=await inbox(null,null,30,true);assert.ok(unread.items.every(n=>!n.read_at));
      await admin();await db.exec("update push_private.deliveries set claimed_at=now()-interval '3 minutes' where status='sending'");
      assert.equal((await claim()).length,0);
    });
    await t.test('chat read acknowledges incoming message notifications on other devices',async()=>{
      await as(0);const message=await send('Odczyt na drugim urządzeniu.');
      await as(1);await db.query('select public.mark_conversation_read($1,$2)',[chat,message.id]);
      assert.equal((await inbox()).items.filter(n=>n.kind==='message'&&!n.read_at).length,0);
      assert.equal((await inbox()).items.filter(n=>n.kind==='invitation_accepted'&&!n.read_at).length,0);
    });
    await t.test('history paginates with stable cursors and mark-all respects the fetched watermark',async()=>{
      await as(1);let first=await inbox(null,null,2);assert.equal(first.has_more,true);
      const last=first.items.at(-1);const next=await inbox(last.created_at,last.id,2);
      assert.equal(next.items.some(n=>first.items.some(a=>a.id===n.id)),false);
      await as(0);await send('Nowa wiadomość po pobraniu historii.');
      await as(1);await one('select public.mark_my_notifications_read(null,$1) as value',[first.fetched_at]);
      assert.equal((await inbox()).unread_count,1);
      await assert.rejects(inbox(first.fetched_at,null));await assert.rejects(read(Array(101).fill(randomUUID())));
    });
    await t.test('proposals are durable, deduplicated and exclude private plans, mismatching dates and children',async()=>{
      await as(1);const own=await one('select public.save_my_trip($1) as value',[{...plan,mode:'flexible'}]);
      let data=await inbox();let matches=data.items.filter(n=>n.kind==='proposal');assert.equal(matches.length,1);assert.equal(matches[0].proposed_trip_id,trip.id);
      await read([matches[0].id]);assert.ok((await inbox()).items.find(n=>n.id===matches[0].id).read_at);
      await as(0);await one('select public.save_my_trip($1) as value',[{...plan,start_date:'2099-06-01',end_date:'2099-06-03'}]);
      await as(1);assert.equal((await inbox()).items.filter(n=>n.kind==='proposal').length,1);
      await one('select public.save_my_trip($1,$2) as value',[{...plan,mode:'flexible',matching_group_kinds:['family'],matching_child_age_bands:['7–9']},own.id]);
      await as(2);const candidate=await one('select public.save_my_trip($1,null,true) as value',[plan]);
      await as(1);assert.equal((await inbox()).items.some(n=>n.proposed_trip_id===candidate.id),false);
      await as(2);await one('select public.save_my_trip($1,$2,false) as value',[plan,candidate.id]);
      await as(1);assert.equal((await inbox()).items.some(n=>n.proposed_trip_id===candidate.id),false);
      await as(2);await one('select public.save_my_profile($1) as value',[{name:'Ekipa z dzieckiem',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,child_age_bands:['7–9'],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}]);
      await as(1);assert.equal((await inbox()).items.some(n=>n.proposed_trip_id===candidate.id),true);
      await one('select public.delete_my_trip($1) as value',[own.id]);
      data=await inbox();assert.equal(data.items.find(n=>n.id===matches[0].id).available,false);
    });
    await t.test('invitation preferences suppress received and accepted push while retaining both inbox entries',async()=>{
      for (const index of [0,2]) {
        await as(index);
        await one('select public.register_my_push_device($1,$2,$3,$4,$5) as value',[randomUUID(),randomUUID(),'ExponentPushToken['+randomUUID().replaceAll('-','')+']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
        await preference('invitations',false);
      }
      await as(2);const request=await one('select public.send_contact_invitation($1,$2,$3) as value',[trip.id,'Poznajmy sie na wyjezdzie!',randomUUID()]);
      await as(0);assert.ok((await inbox()).items.some(n=>n.kind==='invitation_received'&&n.invitation_id===request));
      await one('select public.respond_contact_invitation($1,$2) as value',[request,'accepted']);
      await as(2);assert.ok((await inbox()).items.some(n=>n.kind==='invitation_accepted'&&n.invitation_id===request));
      await admin();assert.equal(await one('select count(*)::int as value from push_private.events where invitation_id=$1',[request]),0);
    });
    await t.test('outbox cleanup does not delete history; bilateral block hides it; account deletion cascades',async()=>{
      await admin();const before=await one('select count(*)::int as value from public.notifications');
      await db.exec('delete from push_private.events');assert.equal(await one('select count(*)::int as value from public.notifications'),before);
      await as(0);await db.query('select public.set_group_block($1,true)',[groups[1]]);
      await as(1);assert.equal((await inbox()).items.some(n=>n.actor_group_id===groups[0]),false);
      assert.equal((await db.query('select * from public.notifications where actor_group_id=$1',[groups[0]])).rows.length,0);
      await admin();await db.query('delete from auth.users where id=$1',[users[1]]);
      assert.equal(await one('select count(*)::int as value from public.notifications where recipient_group_id=$1 or actor_group_id=$1',[groups[1]]),0);
    });
  } finally { await db.close(); }
});
