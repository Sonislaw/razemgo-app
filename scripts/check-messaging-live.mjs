// Opt-in integration check against the linked TEST project. Creates three
// temporary Auth accounts without sending mail, then removes all fixtures.
// Run sequentially with other Supabase CLI commands.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const config=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).flatMap(line=>{
  const match=line.match(/^([A-Z_]+)=(.*)$/);return match?[[match[1],match[2].trim().replace(/^['"]|['"]$/g,'')]]:[];
}));
const url=config.EXPO_PUBLIC_SUPABASE_URL,key=config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const linked=readFileSync('supabase/.temp/project-ref','utf8').trim();
if(new URL(url).hostname!==linked+'.supabase.co')throw new Error('App and linked project must match');
const ids=[randomUUID(),randomUUID(),randomUUID()];
const password=randomBytes(32).toString('hex');
const fixturePath='.expo/check-messaging-live-fixtures.sql';
const clients=[],channels=[],events=[[],[],[]];
function check(condition,stage){if(!condition)throw new Error(stage);}
function sql(text){
  writeFileSync(fixturePath,text,{encoding:'utf8',mode:0o600});
  const args=process.platform==='win32'?['/d','/s','/c',`npx --yes supabase@latest db query --linked --file ${fixturePath}`]:['--yes','supabase@latest','db','query','--linked','--file',fixturePath];
  const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:60000});
  if(result.status!==0)throw new Error('Supabase fixture query failed; output suppressed to protect test credentials');
  return result.stdout;
}
async function rpc(client,name,args){
  const {data,error}=await client.rpc(name,args);
  if(error)throw new Error(`${name}: ${error.code??'request failed'}`);
  return data;
}
async function until(condition,label){
  const end=Date.now()+15000;
  while(Date.now()<end){if(condition())return;await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error('Realtime timeout: '+label);
}
async function main(){
  try{
    sql(`begin;
      ${ids.map(id=>`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at)
        values('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@messaging-live.invalid',
          extensions.crypt('${password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',
          '{"email_verified":true}','','','','',now(),now());
        insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(gen_random_uuid(),'${id}','${id}','{"sub":"${id}","email":"${id}@messaging-live.invalid","email_verified":true}','email',now(),now());`).join('\n')}
      commit;select true as test_identities_created;`);
    const groups=[];
    for(let i=0;i<3;i++){
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});clients.push(client);
      const signed=await client.auth.signInWithPassword({email:ids[i]+'@messaging-live.invalid',password});
      check(!signed.error,'Temporary account login failed');
      const profile=await rpc(client,'save_my_profile',{profile_data:{name:'Kontrola automatyczna '+i,avatar_id:'camp-bear',kind:'couple',
        adult_count:2,child_count:0,child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[],matching:{group_kinds:[],child_age_bands:[],description:''}}});
      groups.push(profile.group.id);
    }
    for(let i=0;i<3;i++)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Realtime subscription timed out')),20000);
      const channel=clients[i].channel('messaging-check-'+ids[i],{config:{postgres_changes_options:{wait:true}}}).on('postgres_changes',{
        event:'*',schema:'public',table:'mailbox_updates',filter:'group_id=eq.'+groups[i],
      },event=>events[i].push(event));channels.push(channel);
      channel.subscribe((status,error)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timer);reject(new Error('Realtime subscription failed: '+(error?.message??status)));}});
    });
    const trip=await rpc(clients[0],'save_my_trip',{trip_data:{mode:'planned',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
      location_id:'pl-locality:messaging-live-check',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'Kontrola automatyczna',campground_address:'',
      travel_mode:'Kamper',description:'Kontrola automatyczna połączenia czatu z wyjazdem.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[]},request_key:randomUUID()});
    const invitation=await rpc(clients[1],'send_contact_invitation',{target_trip_id:trip.id,message_text:'Cześć! Test zaproszenia.',request_key:randomUUID()});
    await until(()=>events[0].length>0&&events[1].length>0,'invitation delivered to both accounts');
    check(events[2].length===0,'Third account received a private event');
    for(let i=0;i<2;i++)check(events[i].every(e=>e.new.group_id===groups[i]&&Object.keys(e.new).every(k=>['group_id','revision'].includes(k))),'Realtime payload contains private data');
    const chat=await rpc(clients[0],'respond_contact_invitation',{invitation_id:invitation,response:'accepted'});
    check(await rpc(clients[0],'respond_contact_invitation',{invitation_id:invitation,response:'accepted'})===chat,'Duplicate conversation');
    const sendKey=randomUUID(),args={conversation_id:chat,message_text:'Jedna wiadomość z dwóch równoległych żądań.',request_key:sendKey};
    const before=events[1].length;
    const [first,second]=await Promise.all([rpc(clients[0],'send_chat_message',args),rpc(clients[0],'send_chat_message',args)]);
    check(first.id===second.id,'Concurrent retry duplicated a message');
    await until(()=>events[1].length>before,'message event');
    const box=await rpc(clients[1],'get_my_mailbox');check(box.conversations.find(c=>c.id===chat).unread_count===1,'Unread count failed');
    await rpc(clients[1],'mark_conversation_read',{conversation_id:chat,through_message_id:first.id});
    const afterRead=await rpc(clients[0],'get_my_mailbox');check(afterRead.conversations.find(c=>c.id===chat).other_read_sequence>=first.sequence,'Read receipt failed');
    const stranger=await clients[2].rpc('get_conversation_messages',{conversation_id:chat});check(stranger.error?.code==='42501','Third account accessed chat RPC');
    const raw=await clients[2].from('chat_messages').select('*').eq('conversation_id',chat);check(!raw.error&&raw.data.length===0,'RLS leaked message history');
    const denied=await clients[2].from('chat_messages').insert({conversation_id:chat,sender_group_id:groups[0],text:'Forged',request_key:randomUUID()});check(!!denied.error,'Direct message insert was allowed');
    await rpc(clients[1],'set_group_block',{target_group_id:groups[0],blocked:true});
    const blocked=await clients[0].rpc('send_chat_message',{conversation_id:chat,message_text:'Blocked',request_key:randomUUID()});check(blocked.error?.code==='42501','Peer block did not stop sending');
    await rpc(clients[0],'report_conversation',{conversation_id:chat,report_reason:'Spam',request_key:randomUUID()});
    check(events[2].length===0,'Third account received an unrelated event');
    console.log('Live Supabase verified: email auth, invitations, acceptance, concurrent retry, messages, unread/read receipts, bilateral block, report, third-account isolation and private Realtime events.');
  }finally{
    await Promise.allSettled(clients.map((client,i)=>channels[i]?client.removeChannel(channels[i]):Promise.resolve()));
    let cleaned=false;
    try{
      const where=ids.map(id=>`'${id}'::uuid`).join(',');
      const verification=JSON.parse(sql(`begin;delete from public.account_reports where reporter_group_id in(select id from public.travel_groups where owner_user_id in(${where}))
        or reported_group_id in(select id from public.travel_groups where owner_user_id in(${where}));
        delete from auth.users where id in(${where});commit;
        select count(*) as remaining_test_accounts from auth.users where id in(${where});`));
      check(verification.rows?.[0]?.remaining_test_accounts===0,'Test account cleanup could not be verified');
      cleaned=true;
      console.log('Temporary test accounts, trips, messages, blocks and reports removed.');
    }finally{
      if(cleaned){try{unlinkSync(fixturePath);}catch{}}
      else console.error('Cleanup SQL (IDs only) retained at '+fixturePath+'; run it with Supabase CLI.');
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
