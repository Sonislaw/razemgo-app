import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000003';
let sequence=100;
const key=()=>`00000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;
const profile={name:'Ekipa',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,
  child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[],
  matching:{group_kinds:['family'],child_age_bands:['4–6'],description:'PRIVATE PREFERENCES'}};
const plan={adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
  location_id:'pl-locality:test',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',
  campground_name:'Pod Wydmami',campground_address:'',travel_mode:'Kamper',
  description:'Spokojny wyjazd nad morze, rowery i ognisko.',landscape:'coast',
  interests:['Rowery'],animal_kinds:[],matching_group_kinds:['family'],matching_child_age_bands:['4–6']};

test('messaging: server authorization, atomic acceptance, delivery, receipts and safety',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}');`);
    for(const file of ['202610230001_profiles.sql','202610240001_trips.sql','202610240002_trip_permissions.sql','202610240003_messaging.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const as=id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
    const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const mailbox=()=>value('select public.get_my_mailbox() as value');
    const save=()=>value('select public.save_my_trip($1::jsonb,null,false,$2) as value',[JSON.stringify(plan),key()]);
    const invite=(trip,token=key(),source=null,text='Cześć, porozmawiajmy o wyjeździe!')=>value('select public.send_contact_invitation($1,$2,$3,$4) as value',[trip,text,token,source]);
    const respond=(id,response)=>value('select public.respond_contact_invitation($1,$2) as value',[id,response]);
    const send=(id,text,token=key())=>value('select public.send_chat_message($1,$2,$3) as value',[id,text,token]);
    const history=(id,before=null,size=50)=>db.query('select * from public.get_conversation_messages($1,$2,$3)',[id,before,size]);
    const read=(id,message)=>value('select public.mark_conversation_read($1,$2) as value',[id,message]);
    const block=(group,blocked)=>db.query('select public.set_group_block($1,$2)',[group,blocked]);
    const groups={};
    for(const id of [A,B,C]){await as(id);groups[id]=(await value('select public.save_my_profile($1) as value',[JSON.stringify({...profile,name:'Ekipa '+id.slice(-1)})])).group.id;}
    await as(A);const trip=await save();
    await as(B);const own=await save();
    let invitation,chat;
    await t.test('only another active public trip can be contacted; retry uses one invitation',async()=>{
      await assert.rejects(invite(trip.id,key(),trip.id));
      const token=key();invitation=await invite(trip.id,token,own.id);
      assert.equal(await invite(trip.id,token,own.id),invitation);
      assert.equal(await invite(trip.id),invitation);
      const box=await mailbox();assert.equal(box.invitations.length,1);
      assert.equal(box.invitations[0].sender_group_id,groups[B]);
      assert.equal(box.invitations[0].recipient_group_id,groups[A]);
      assert.equal(box.contacts[0].child_count,undefined);
      assert.equal(JSON.stringify(box).includes('PRIVATE PREFERENCES'),false);
      assert.equal(box.contacts[0].owner_user_id,undefined);
      assert.equal(box.invitations[0].trip_snapshot.child_age_bands,undefined);
      await assert.rejects(invite(own.id));
      await assert.rejects(invite(trip.id,key(),null,''));
      await assert.rejects(invite(trip.id,key(),null,'x'.repeat(501)));
      assert.equal(box.conversations.length,0);
    });
    await t.test('nonparticipants cannot enumerate invitations, accept, send, read or change tables',async()=>{
      await as(C);assert.equal((await mailbox()).invitations.length,0);
      assert.equal((await db.query('select * from public.contact_invitations')).rows.length,0);
      await assert.rejects(respond(invitation,'accepted'));
      await assert.rejects(db.query('update public.contact_invitations set status=$1 where id=$2',['accepted',invitation]));
      await assert.rejects(db.query('insert into public.group_blocks(blocker_group_id,blocked_group_id) values($1,$2)',[groups[A],groups[B]]));
      await assert.rejects(block(groups[A],true));
      await as(B);await assert.rejects(respond(invitation,'accepted'));await assert.rejects(respond(invitation,'declined'));
      await as(A);await assert.rejects(respond(invitation,'withdrawn'));
    });
    await t.test('acceptance is atomic and idempotent, with a single conversation and initial message',async()=>{
      chat=await respond(invitation,'accepted');assert.match(chat,/^[\da-f-]{36}$/);
      assert.equal(await respond(invitation,'accepted'),chat);
      assert.equal((await mailbox()).conversations.length,1);
      assert.equal((await history(chat)).rows.length,1);
      assert.equal((await mailbox()).conversations[0].unread_count,1);
      await assert.rejects(respond(invitation,'declined'));
      await as(B);assert.equal((await mailbox()).conversations[0].unread_count,0);
      await as(C);await assert.rejects(history(chat));await assert.rejects(send(chat,'Intruz'));
      await assert.rejects(read(chat,invitation));
      assert.deepEqual((await db.query('select * from public.chat_messages')).rows,[]);
      assert.deepEqual((await db.query('select * from public.conversations')).rows,[]);
      await assert.rejects(db.query('delete from public.chat_messages'));
      await as(A);
    });
    let first,second;
    await t.test('messages are attributed by the server, trim text, and survive lost response retries',async()=>{
      const token=key();first=await send(chat,'  Pierwsza wiadomość  ',token);
      assert.equal(first.sender_group_id,groups[A]);assert.equal(first.text,'Pierwsza wiadomość');
      assert.equal((await send(chat,'Pierwsza wiadomość',token)).id,first.id);
      assert.equal((await history(chat)).rows.length,2);
      await assert.rejects(send(chat,''));await assert.rejects(send(chat,'x'.repeat(2001)));
      second=await send(chat,'Druga wiadomość');
      await as(B);assert.equal((await mailbox()).conversations[0].unread_count,2);
    });
    await t.test('read high water mark cannot read a newer message or move backwards',async()=>{
      await read(chat,first.id);assert.equal((await mailbox()).conversations[0].unread_count,1);
      await read(chat,second.id);assert.equal((await mailbox()).conversations[0].unread_count,0);
      await read(chat,first.id);assert.equal((await mailbox()).conversations[0].unread_count,0);
      await as(A);assert.equal((await mailbox()).conversations[0].other_read_sequence,second.sequence);
      const later=await send(chat,'Nowa po odczycie');
      await as(B);assert.equal((await mailbox()).conversations[0].unread_count,1);
      const page1=(await history(chat,null,2)).rows;const page2=(await history(chat,page1.at(-1).sequence,2)).rows;
      assert.equal(page1[0].id,later.id);assert.equal(new Set([...page1,...page2].map(m=>m.id)).size,4);
      await read(chat,later.id);
    });
    await t.test('either side can block; both are denied new contact and sending, history is preserved',async()=>{
      await block(groups[A],true);await block(groups[A],true);
      assert.equal((await mailbox()).blocked_group_ids.length,1);
      assert.equal((await mailbox()).conversations[0].blocked,true);
      assert.ok((await history(chat)).rows.length);
      await assert.rejects(send(chat,'Nie można wysłać'));
      assert.equal((await db.query('select * from public.list_public_trips()')).rows.length,0);
      await as(A);await assert.rejects(send(chat,'Też nie można'));
      assert.equal((await mailbox()).blocked_group_ids.length,0);
      assert.equal((await mailbox()).conversations[0].blocked,true);
      await block(groups[B],true);await as(B);await block(groups[A],false);
      await assert.rejects(send(chat,'Druga strona nadal blokuje'));
      await as(A);await block(groups[B],false);await send(chat,'Kontakt przywrócony');
    });
    await t.test('reports are durable, idempotent, participant-only and evidence is private',async()=>{
      const token=key();const report=()=>value('select public.report_conversation($1,$2,$3) as value',[chat,'Spam',token]);
      const id=await report();assert.equal(await report(),id);
      assert.equal((await mailbox()).reports.length,1);
      assert.equal((await mailbox()).reports[0].evidence,undefined);
      await assert.rejects(db.query('select * from public.account_reports'));
      await as(C);await assert.rejects(report());
      await as(A);
    });
    await t.test('withdrawal and decline authorize only the correct party and never create a chat',async()=>{
      await as(C);const x=await invite(trip.id);await respond(x,'withdrawn');assert.equal(await respond(x,'withdrawn'),null);
      await as(A);await assert.rejects(respond(x,'accepted'));
      await as(C);const y=await invite(trip.id);await as(A);await respond(y,'declined');await respond(y,'declined');
      assert.equal((await mailbox()).conversations.length,1);
      await as(C);await assert.rejects(respond(y,'withdrawn'));
    });
    await t.test('closing or deleting an advertisement preserves accepted history and its trip snapshot',async()=>{
      await as(A);await db.query('select public.change_my_trip_status($1,$2)',[trip.id,'paused']);
      await as(C);await assert.rejects(invite(trip.id));
      await as(A);await db.query('select public.delete_my_trip($1)',[trip.id]);
      const box=await mailbox();const i=box.invitations.find(i=>i.id===invitation);
      assert.equal(i.trip_id,null);assert.equal(i.trip_snapshot.location_name,'Chłapowo');
      assert.ok((await history(chat)).rows.length);await send(chat,'Nadal rozmawiamy');
    });
    await t.test('anonymous RPCs and direct tables are denied even with inherited hosted defaults',async()=>{
      await db.exec('reset role;set role anon');
      await assert.rejects(mailbox());await assert.rejects(history(chat));await assert.rejects(send(chat,'x'));
      await assert.rejects(db.query('select * from public.contact_invitations'));
      await assert.rejects(db.query('select messaging_private.my_group_id()'));
    });
    await t.test('account deletion clears contact and chat data; moderation evidence remains server-only',async()=>{
      await db.exec('reset role');await db.query('delete from auth.users where id=$1',[B]);
      assert.equal((await db.query('select * from public.conversations')).rows.length,0);
      assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);
      assert.equal((await db.query('select * from public.account_reports')).rows.length,1);
      await as(A);assert.equal((await mailbox()).conversations.length,0);
      await as(B);await assert.rejects(mailbox());
    });
  }finally{await db.close();}
});
