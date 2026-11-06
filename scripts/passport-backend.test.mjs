import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import catalog from '../shared/passport-catalog.json' with { type: 'json' };
import { testDatabase, asUser, profile, trip } from './support/database.mjs';
import { parseTravelerPassport } from '../src/features/passport/passport-data.ts';

const migration = new URL('../supabase/migrations/202611050001_traveler_passport.sql', import.meta.url);
test('passport awards follow real writes, are monotonic and cannot be forged or exposed through another account', async t => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const groups = [];
  const call = async (name, args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const own = () => call('get_my_traveler_passport');
  const progress = (p,id) => p.categories.find(c=>c.id===id);
  const saveTrip = async (payload=trip, key=randomUUID(), id=null, draft=false) => call('save_my_trip',[payload,id,draft,key]);
  try {
    for (let i=0;i<users.length;i++) {
      await db.query('insert into auth.users values($1)',[users[i]]);
      await asUser(db,users[i]);
      groups.push((await call('save_my_profile',[{...profile('Paszport '+i),about:i===0?'Lubimy leśne spacery i poznawanie innych podróżników.':''}])).group.id);
      await db.exec('reset role');
    }
    await t.test('catalog and levels match the shared application rules',async()=>{
      const categories=(await db.query('select id,thresholds from passport_private.categories order by position')).rows;
      assert.deepEqual(categories,catalog.categories.map(({id,thresholds})=>({id,thresholds})));
      assert.deepEqual((await db.query('select * from passport_private.levels order by level')).rows,catalog.levels);
    });
    await asUser(db,users[0]);
    await t.test('first visit/profile awards and visits from multiple devices count once per Warsaw date',async()=>{
      const first=await own(), second=await own();
      parseTravelerPassport(first);
      assert.equal(progress(first,'profile').tier,1);
      assert.equal(progress(first,'active_days').count,1);
      assert.deepEqual(second,first);
      assert.equal(first.summary.points,20);
      await call('save_my_profile',[{...profile('Paszport 0'),about:'Jeszcze dłuższy opis naszej podróżującej ekipy.'}]);
      assert.equal(progress(await own(),'profile').count,1);
    });
    let published;
    await t.test('draft/private/retried publications and edits never grant duplicate trips or destinations',async()=>{
      const draft=await saveTrip(trip,randomUUID(),null,true);
      assert.equal(progress(await own(),'plans').count,0);
      const key=randomUUID(); published=await saveTrip(trip,key);
      await saveTrip(trip,key);
      await saveTrip({...trip,landscape:'forest',location_id:'pl-locality:8457',location_name:'Gdańsk'},randomUUID(),published.id);
      let p=await own();
      assert.equal(progress(p,'plans').count,1);
      assert.equal(progress(p,'destinations').count,1);
      assert.equal(progress(p,'landscapes').count,1);
      await saveTrip({...trip,campground_name:'Leśny kemping'},randomUUID(),published.id);
      await saveTrip({...trip,campground_name:'Inny kemping'},randomUUID(),published.id);
      assert.equal(progress(await own(),'campgrounds').count,1);
      await saveTrip({...trip,mode:'flexible'},randomUUID(),published.id);
      assert.equal(progress(await own(),'ideas').count,0);
      await call('change_my_trip_status',[published.id,'paused']);
      await call('change_my_trip_status',[published.id,'published']);
      assert.equal(progress(await own(),'plans').count,1);
      await saveTrip({...trip,visibility:'private'});
      assert.equal(progress(await own(),'plans').count,1);
      await call('delete_my_trip',[draft.id]);
    });
    await t.test('a separate flexible publication earns its own category',async()=>{
      await saveTrip({...trip,mode:'flexible',location_id:'pl-region:pomorskie',location_name:'Pomorskie',location_region:'',location_kind:'region'});
      assert.equal(progress(await own(),'ideas').count,1);
    });
    await asUser(db,users[1]);
    const otherTrip=await saveTrip();
    await asUser(db,users[0]);
    await t.test('favorites, reactions and saved filters survive unsetting without counting the same object again',async()=>{
      for(let i=0;i<2;i++) {
        await call('set_my_group_favorite',[groups[1],true]);
        await call('set_my_group_favorite',[groups[1],false]);
        await call('set_my_trip_favorite',[otherTrip.id,true]);
        await call('set_my_trip_favorite',[otherTrip.id,false]);
        await call('set_my_trip_reaction',[otherTrip.id,'love']);
        await call('set_my_trip_reaction',[otherTrip.id,null]);
      }
      const filterId=randomUUID();
      await call('save_my_filter_set',[filterId,'trips','Wyjazd',{}]);
      await call('save_my_filter_set',[filterId,'trips','Inna nazwa',{}]);
      await call('delete_my_filter_set',[filterId]);
      await call('save_my_filter_set',[randomUUID(),'trips','Ponownie te same kryteria',{}]);
      const p=await own();
      for(const id of ['group_favorites','trip_favorites','trip_reactions','saved_filters'])assert.equal(progress(p,id).count,1);
    });
    let chat, message;
    await t.test('only accepted contacts count; 10 and 50 messages earn separate tiers with idempotent sends',async()=>{
      // Existing messaging constraints are tested independently; these committed
      // rows simulate accepted invitation/message writes without sending anything.
      await db.exec('reset role');
      const invitation=randomUUID();
      await db.query(`insert into public.contact_invitations(id,sender_group_id,recipient_group_id,trip_reference,trip_snapshot,text,status,request_key)
        values($1,$2,$3,$4,'{}','Poznajmy się','accepted',$5)`,[invitation,groups[0],groups[1],otherTrip.id,randomUUID()]);
      chat=randomUUID();
      await db.query('insert into public.conversations(id,invitation_id,sender_group_id,recipient_group_id) values($1,$2,$3,$4)',[chat,invitation,groups[0],groups[1]]);
      await asUser(db,users[0]);
      assert.equal(progress(await own(),'contacts').count,1);
      for(let i=0;i<50;i++){
        const key=randomUUID();
        message=await call('send_chat_message',[chat,'Wiadomość numer '+i,key]);
        if(i===0)await call('send_chat_message',[chat,'Wiadomość numer '+i,key]);
        if(i===8)assert.equal(progress(await own(),'messages').tier,0);
        if(i===9)assert.equal(progress(await own(),'messages').tier,1);
      }
      const p=await own();
      assert.equal(progress(p,'messages').count,50);
      assert.equal(progress(p,'messages').tier,2);
      assert.equal(progress(p,'messages').awards.length,2);
      await asUser(db,users[1]);
      assert.equal(progress(await own(),'contacts').count,1);
      assert.equal(progress(await own(),'messages').count,0);
      for(let i=0;i<2;i++) {
        await call('set_message_reaction',[message.id,'love']);
        await call('set_message_reaction',[message.id,null]);
      }
      assert.equal(progress(await own(),'message_reactions').count,1);
    });
    await t.test('public identities carry levels, while public passports redact private activity counts',async()=>{
      const publicPassport=await call('get_public_traveler_passport',[groups[0]]);
      parseTravelerPassport(publicPassport);
      assert.equal(publicPassport.own,false);
      assert.ok(publicPassport.categories.every(c=>c.count===null));
      assert.equal(progress(publicPassport,'messages').tier,2);
      const directory=await call('list_public_groups_v3',[{},null,5]);
      assert.deepEqual(directory.items.find(x=>x.crew.id===groups[0]).crew.passport,publicPassport.summary);
      const details=await call('get_public_group_v3',[groups[0],null,5]);
      assert.deepEqual(details.crew.passport,publicPassport.summary);
      const listed=(await db.query('select * from public.list_public_trips($1)',[published.id])).rows;
      assert.deepEqual(listed[0].crew.passport,publicPassport.summary);
      await call('set_group_block',[groups[0],true]);
      assert.equal(await call('get_public_traveler_passport',[groups[0]]),null);
      await call('set_group_block',[groups[0],false]);
    });
    await t.test('private counters, awards, event recording and expired/guest access are protected',async()=>{
      for(const table of ['events','progress','awards','summaries','trip_publications'])await assert.rejects(db.query('select * from passport_private.'+table));
      await assert.rejects(db.query("select passport_private.record_event($1,'messages','fake')",[groups[0]]));
      await assert.rejects(db.query("update passport_private.summaries set points=99999 where group_id=$1",[groups[1]]));
      await db.exec('reset role');
      await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)',[users[2]]);
      await asUser(db,users[2]);
      await assert.rejects(own(),e=>e.code==='42501');
      await asUser(db,users[1]);
      assert.equal(await call('get_public_traveler_passport',[groups[2]]),null);
      await db.exec('reset role');
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[users[1]]);
      await asUser(db,users[1]);
      await assert.rejects(own(),e=>e.code==='42501');
      await assert.rejects(call('get_public_traveler_passport',[groups[0]]),e=>e.code==='42501');
      await db.exec('reset role;set role anon');
      await assert.rejects(own());
      await assert.rejects(call('get_public_traveler_passport',[groups[0]]));
    });
    await t.test('higher message milestones add points once and stop storing event IDs after the final tier',async()=>{
      await asUser(db,users[0]);
      for(let i=50;i<505;i++){
        await call('send_chat_message',[chat,'Kolejna rozmowa '+i,randomUUID()]);
        if(i===199)assert.equal(progress(await own(),'messages').tier,3);
      }
      const result=await own();parseTravelerPassport(result);
      assert.equal(progress(result,'messages').tier,4);
      assert.equal(progress(result,'messages').count,500);
      assert.equal(progress(result,'messages').awards.length,4);
      await db.exec('reset role');
      assert.equal((await db.query("select count(*)::int n from passport_private.events where group_id=$1 and category='messages'",[groups[0]])).rows[0].n,500);
    });
    await t.test('removing old activity keeps earned badges; deleting the account removes all passport data',async()=>{
      await db.exec('reset role');
      const before=(await db.query('select * from passport_private.summaries where group_id=$1',[groups[0]])).rows[0];
      await db.query('delete from public.chat_messages where sender_group_id=$1',[groups[0]]);
      assert.deepEqual((await db.query('select * from passport_private.summaries where group_id=$1',[groups[0]])).rows[0],before);
      await db.query('delete from auth.users where id=$1',[users[0]]);
      for(const table of ['events','progress','awards','summaries','trip_publications'])assert.equal((await db.query('select count(*)::int n from passport_private.'+table+' where group_id=$1',[groups[0]])).rows[0].n,0);
    });
  } finally {await db.close();}
});

test('migration credits existing evidence once and leaves unrelated application data intact',async()=>{
  const db=await testDatabase({before:'202611050001'});
  try {
    const user=randomUUID();await db.query('insert into auth.users values($1)',[user]);await asUser(db,user);
    const g=(await db.query('select public.save_my_profile($1) value',[{...profile('Starsza ekipa'),about:'Podróżujemy od dawna i lubimy zwiedzać.'}])).rows[0].value.group;
    const t=(await db.query('select public.save_my_trip($1,null,false,$2) value',[trip,randomUUID()])).rows[0].value;
    await db.exec('reset role');
    await db.exec(await readFile(migration,'utf8'));
    await asUser(db,user);
    const p=(await db.query('select public.get_my_traveler_passport() value')).rows[0].value;
    assert.equal(p.categories.find(c=>c.id==='plans').count,1);
    assert.equal(p.categories.find(c=>c.id==='profile').tier,1);
    const preserved=(await db.query('select * from public.trip_plans where id=$1',[t.id])).rows[0];
    assert.equal(preserved.description,t.description);assert.equal(preserved.group_id,g.id);
  }finally{await db.close();}
});
