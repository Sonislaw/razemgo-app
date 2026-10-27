import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('message reactions are private, belong to the recipient and never produce message/unread/push events',async t=>{
  const db=new PGlite(),users=Array.from({length:3},randomUUID),groups=[];
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    const root=()=>db.exec('reset role');
    const as=async i=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$1,false)",[users[i]]);};
    const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
    for(let i=0;i<3;i++){
      await root();await db.query('insert into auth.users values($1)',[users[i]]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[users[i]]);
      await as(i);groups.push((await rpc('save_my_profile',[{name:'Ekipa '+i,avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}])).group.id);
    }
    await as(0);const invitation=await rpc('send_profile_invitation',[groups[1],'Cześć, porozmawiajmy!',randomUUID()]);
    await as(1);const chat=await rpc('respond_contact_invitation',[invitation,'accepted']);
    const peer=await rpc('send_chat_message',[chat,'Odpowiedź rozmówcy',randomUUID()]);
    const initial=(await db.query('select * from public.get_conversation_messages($1)',[chat])).rows.find(m=>m.sender_group_id===groups[0]);
    const get=(id=chat,ids=[peer.id])=>rpc('get_message_reactions',[id,ids]);
    const set=(kind,id=peer.id)=>rpc('set_message_reaction',[id,kind]);
    await as(0);const baseline=(await rpc('get_my_mailbox')).conversations[0];
    await root();const before=(await db.query('select (select count(*) from public.notifications) notifications,(select count(*) from push_private.events) pushes,(select count(*) from public.chat_messages) messages')).rows[0];
    await as(0);
    await t.test('add, retry, change and remove one reaction; either participant can read the confirmed value',async()=>{
      assert.deepEqual(await get(),[{message_id:peer.id,kind:null}]);
      const a=await set('love');assert.deepEqual(a,{message_id:peer.id,kind:'love'});
      const revision=(await db.query('select revision from public.mailbox_updates')).rows[0].revision;
      assert.deepEqual(await set('love'),a);assert.equal((await db.query('select revision from public.mailbox_updates')).rows[0].revision,revision);
      for(const kind of ['like','laugh','wow','hug','thanks']){await set(kind);assert.equal((await get())[0].kind,kind);}
      await as(1);assert.equal((await get())[0].kind,'thanks');
      await rpc('set_message_reaction',[initial.id,'hug']);
      await as(0);assert.equal((await get(chat,[initial.id]))[0].kind,'hug');
      await set(null);assert.equal((await get())[0].kind,null);await set(null);
      assert.equal((await rpc('get_my_mailbox')).conversations[0].unread_count,baseline.unread_count);
      assert.equal((await rpc('get_my_mailbox')).conversations[0].updated_at,baseline.updated_at);
      await root();assert.deepEqual((await db.query('select (select count(*) from public.notifications) notifications,(select count(*) from push_private.events) pushes,(select count(*) from public.chat_messages) messages')).rows[0],before);await as(0);
    });
    await t.test('own messages, unsupported choices, foreign conversations, malformed batches and direct table access fail',async()=>{
      await assert.rejects(set('love',initial.id),e=>e.code==='42501');
      await assert.rejects(set('angry'),e=>e.code==='22023');
      await assert.rejects(get(chat,null),e=>e.code==='22023');
      await assert.rejects(get(chat,[peer.id,peer.id]),e=>e.code==='22023');
      await assert.rejects(get(chat,[randomUUID()]),e=>e.code==='P0002');
      await assert.rejects(get(chat,[...Array.from({length:101},randomUUID)]),e=>e.code==='22023');
      await assert.rejects(db.query('select * from messaging_private.message_reactions'),e=>e.code==='42501');
      await assert.rejects(db.query('delete from messaging_private.message_reactions'),e=>e.code==='42501');
      await as(2);await assert.rejects(get(),e=>e.code==='42501');await assert.rejects(set('love'),e=>e.code==='42501');
      await db.exec('reset role;set role anon');await assert.rejects(get(),e=>e.code==='42501');await assert.rejects(set('love'),e=>e.code==='42501');
      await as(0);
      const otherInvitation=await rpc('send_profile_invitation',[groups[2],'Osobna rozmowa',randomUUID()]);
      await as(2);const otherChat=await rpc('respond_contact_invitation',[otherInvitation,'accepted']);
      const otherMessage=(await db.query('select * from public.get_conversation_messages($1)',[otherChat])).rows[0];
      await as(0);await assert.rejects(get(chat,[peer.id,otherMessage.id]),e=>e.code==='P0002');
    });
    await t.test('blocking in either direction prevents changes and removals but preserves the readable history',async()=>{
      await set('love');await rpc('set_group_block',[groups[1],true]);
      assert.equal((await get())[0].kind,'love');
      await assert.rejects(set('like'),e=>e.code==='42501');await assert.rejects(set(null),e=>e.code==='42501');
      await as(1);await assert.rejects(rpc('set_message_reaction',[initial.id,'like']),e=>e.code==='42501');
      await as(0);await rpc('set_group_block',[groups[1],false]);await set('like');
    });
    await t.test('suspension revokes access and Auth deletion cascades through reactions',async()=>{
      await root();await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[0]]);
      await as(0);await assert.rejects(get(),e=>e.code==='42501');await assert.rejects(set('love'),e=>e.code==='42501');
      await as(1);await assert.rejects(rpc('set_message_reaction',[initial.id,'like']),e=>e.code==='42501');
      await root();await db.query('delete from moderation_private.suspended_accounts where user_id=$1',[users[0]]);
      await db.query('delete from auth.users where id=$1',[users[1]]);
      assert.equal(Number((await db.query('select count(*) n from messaging_private.message_reactions')).rows[0].n),0);
    });
  }finally{await db.close();}
});
