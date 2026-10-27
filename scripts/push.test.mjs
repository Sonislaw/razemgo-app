import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePushTarget, pushDestination, pushNavigationReady, pushPreferenceAllows } from '../src/features/notifications/push-data.ts';
import { dispatchPush, pushMessage, validDispatchSecret } from '../supabase/functions/dispatch-push/push-worker.ts';

const group='00000000-0000-4000-8000-000000000001',event='00000000-0000-4000-8000-000000000002',chat='00000000-0000-4000-8000-000000000003';
const job=(patch={})=>({delivery_id:event,event_id:event,device_id:group,push_token:'ExponentPushToken[testToken123456]',kind:'message',recipient_group_id:group,invitation_id:event,conversation_id:chat,ticket_id:null,claim_key:group,attempts:1,...patch});
function fixture(jobs){const outcomes=[];return {outcomes,client:{rpc:async(name,args)=>name==='claim_push_deliveries'?{data:jobs,error:null}:(outcomes.push(args),{data:null,error:null})}};}

test('notification taps whitelist destinations and require the matching signed-in crew',()=>{
  const target=parsePushTarget({v:1,eventId:event,kind:'message',recipientGroupId:group,conversationId:chat,url:'https://evil.example'});
  assert.deepEqual(pushDestination(target,group),{pathname:'/chat/[id]',params:{id:chat}});
  assert.equal(pushDestination(target,event),null);
  assert.deepEqual(pushDestination(parsePushTarget({v:1,eventId:event,kind:'invitation_received',recipientGroupId:group,invitationId:event}),group),{pathname:'/messages'});
  for(const invalid of [null,'/settings',{}, {v:1,eventId:event,kind:'message',recipientGroupId:group,conversationId:'../../settings'}, {v:1,eventId:event,kind:'unknown',recipientGroupId:group,conversationId:chat}])assert.equal(parsePushTarget(invalid),null);
});
test('all payloads contain generic copy, identifiers, stable collapse/tag and no private message text',()=>{
  for(const kind of ['invitation_received','invitation_accepted','message','favorite_trip','trip_reaction']){
    const payload=pushMessage(job({kind,...(['favorite_trip','trip_reaction'].includes(kind)?{trip_id:chat,invitation_id:null,conversation_id:null}:{})}));assert.ok(payload.title);assert.ok(payload.body);
    assert.equal(payload.channelId,kind==='favorite_trip'?'razemgo-favorite-trips':kind==='trip_reaction'?'razemgo-reactions':'razemgo-contact');assert.equal(payload.data.recipientGroupId,group);
    assert.equal(payload.tag,payload.collapseId);assert.equal(payload.data.url,undefined);
    assert.equal(Object.keys(payload.data).includes('text'),false);
    assert.ok(parsePushTarget(payload.data));
  }
});
test('favorite trip taps use only validated trip identifiers and remain isolated across accounts',()=>{
  const data={v:1,eventId:event,kind:'favorite_trip',recipientGroupId:group,tripId:chat,url:'/settings'};
  const target=parsePushTarget(data);
  assert.deepEqual(pushDestination(target,group),{pathname:'/trip/[id]',params:{id:chat}});
  assert.equal(pushDestination(target,event),null);
  for(const tripId of [undefined,null,'','../../settings','https://evil.example']) assert.equal(parsePushTarget({...data,tripId}),null);
  assert.equal(pushPreferenceAllows('favorite_trip',null),true);
  assert.equal(pushPreferenceAllows('favorite_trip',{}),true);
  assert.equal(pushPreferenceAllows('favorite_trip',{push_favorite_trips:false}),false);
  assert.equal(pushPreferenceAllows('favorite_trip',{push_favorite_trips:true,push_messages:false,push_invitations:false}),true);
  assert.equal(pushPreferenceAllows('message',{push_favorite_trips:true,push_messages:false}),false);
  assert.equal(pushPreferenceAllows('invitation_received',{push_favorite_trips:true,push_invitations:false}),false);
});

test('proposal digests route to an unread trip, respect the account preference and expose no match or profile contents',()=>{
  const notification='00000000-0000-4000-8000-000000000004';
  const payload=pushMessage(job({kind:'proposal',trip_id:chat,notification_id:notification,proposal_count:3,invitation_id:null,conversation_id:null}));
  assert.equal(payload.channelId,'razemgo-proposals');assert.equal(payload.title,'Nowe propozycje wyjazdów');
  const target=parsePushTarget({...payload.data,url:'https://untrusted.example'});
  assert.equal(target.notificationId,notification);assert.notEqual(target.notificationId,target.eventId);
  assert.deepEqual(pushDestination(target,group),{pathname:'/trip/[id]',params:{id:chat}});assert.equal(pushDestination(target,event),null);
  assert.equal(pushPreferenceAllows('proposal',null),true);assert.equal(pushPreferenceAllows('proposal',{push_proposals:false}),false);
  assert.equal(parsePushTarget({...payload.data,notificationId:'../../settings'}),null);
  assert.equal(parsePushTarget({...payload.data,tripId:'../../settings'}),null);
  assert.equal(parsePushTarget({...payload.data,notificationId:undefined}),null);
  assert.deepEqual(Object.keys(payload.data).sort(),['eventId','kind','notificationId','recipientGroupId','tripId','v']);
  assert.equal(pushMessage(job({kind:'proposal',proposal_count:1})).title,'Nowa propozycja wyjazdu');
});
test('cold-start notification navigation waits for restoration, onboarding and authentication redirects',()=>{
  assert.equal(pushNavigationReady(false,'root','/'),false);
  assert.equal(pushNavigationReady(true,undefined,'/'),false);
  for(const pathname of ['/account-loading','/welcome','/onboarding','/auth/callback','/auth/sign-in','/auth/reset-password'])
    assert.equal(pushNavigationReady(true,'root',pathname),false);
  assert.equal(pushNavigationReady(true,'root','/'),true);
  assert.equal(pushNavigationReady(true,'root','/messages'),true);
});
test('reaction pushes open the owner trip, respect their own preference and contain no actor identity',()=>{
  const data={v:1,eventId:event,kind:'trip_reaction',recipientGroupId:group,tripId:chat};
  const target=parsePushTarget(data);
  assert.deepEqual(pushDestination(target,group),{pathname:'/trips/[id]',params:{id:chat}});
  assert.equal(pushDestination(target,event),null);
  for(const tripId of [undefined,null,'../../settings','https://evil.example'])assert.equal(parsePushTarget({...data,tripId}),null);
  assert.equal(pushPreferenceAllows('trip_reaction',null),true);
  assert.equal(pushPreferenceAllows('trip_reaction',{push_reactions:false}),false);
  assert.equal(pushPreferenceAllows('trip_reaction',{push_reactions:true,push_messages:false}),true);
  const payload=pushMessage(job({kind:'trip_reaction',trip_id:chat,invitation_id:null,conversation_id:null}));
  assert.deepEqual(Object.keys(payload.data).sort(),['eventId','kind','recipientGroupId','tripId','v']);
});
test('the dispatcher requires the full server-only secret',()=>{
  const secret='a'.repeat(64);assert.equal(validDispatchSecret(secret,secret),true);
  for(const actual of [null,'',secret.slice(1),secret.slice(0,-1)+'b','public-key'])assert.equal(validDispatchSecret(actual,secret),false);
  assert.equal(validDispatchSecret(secret,undefined),false);
});
test('tickets are persisted but are not falsely reported as confirmed delivery',async()=>{
  const {client,outcomes}=fixture([job()]);const requests=[];
  const stats=await dispatchPush(client,async(url,options)=>{requests.push([url,JSON.parse(options.body)]);return Response.json({data:[{status:'ok',id:'ticket'}]});});
  assert.equal(stats.submitted,1);assert.equal(stats.confirmed,0);assert.equal(outcomes[0].result,'ticket');
  assert.equal(outcomes[0].expo_ticket_id,'ticket');assert.match(requests[0][0],/\/send$/);
});
test('unregistered tokens are removed while credential errors retry without deleting a device',async()=>{
  const {client,outcomes}=fixture([job(),job({delivery_id:chat})]);
  await dispatchPush(client,async()=>Response.json({data:[{status:'error',details:{error:'DeviceNotRegistered'}},{status:'error',details:{error:'InvalidCredentials'}}]}));
  assert.deepEqual(outcomes.map(o=>o.result),['invalid','retry']);assert.equal(outcomes[0].expected_token,job().push_token);
});
test('a transient network failure releases work for retry with the same event identity',async()=>{
  const {client,outcomes}=fixture([job()]);await dispatchPush(client,async()=>{throw new TypeError('Network unavailable');});
  assert.equal(outcomes[0].result,'retry');assert.equal(outcomes[0].delivery_id,event);assert.equal(outcomes[0].lease,group);
});
test('receipt checks confirm provider acceptance and never re-send an existing ticket',async()=>{
  const {client,outcomes}=fixture([job({ticket_id:'ticket-1'}),job({ticket_id:'ticket-2',delivery_id:chat})]);
  const urls=[];const stats=await dispatchPush(client,async(url)=>{urls.push(url);return Response.json({data:{'ticket-1':{status:'ok'}}});});
  assert.equal(stats.confirmed,1);assert.deepEqual(outcomes.map(o=>o.result),['sent','retry']);assert.ok(urls.every(url=>url.endsWith('/getReceipts')));
});
test('a failed outcome write aborts the run so leases can recover instead of claiming success',async()=>{
  const {client}=fixture([job()]);const rpc=client.rpc;client.rpc=async(name,args)=>name==='finish_push_delivery'?{error:new Error('Database unavailable')} : rpc(name,args);
  await assert.rejects(dispatchPush(client,async()=>Response.json({data:[{status:'ok',id:'ticket'}]})),/persist delivery/);
});

test('provider authentication failures retain a safe code, retry, and never remove devices',async()=>{
  for (const [status,code] of [[401,'ExpoUnauthorized'],[403,'ExpoForbidden'],[429,'ExpoRateLimited'],[503,'ExpoUnavailable']]) {
    const {client,outcomes}=fixture([job()]);
    await dispatchPush(client,async()=>new Response('private provider body',{status}));
    assert.equal(outcomes[0].result,'retry');assert.equal(outcomes[0].failure_code,code);
    assert.equal(JSON.stringify(outcomes).includes('private'),false);
  }
});
test('receipt network failures are distinguishable from a normal pending receipt',async()=>{
  const {client,outcomes}=fixture([job({ticket_id:'ticket'})]);
  await dispatchPush(client,async()=>{throw new TypeError('private network error');});
  assert.equal(outcomes[0].failure_code,'ExpoUnavailable');
  const pending=fixture([job({ticket_id:'ticket'})]);
  await dispatchPush(pending.client,async()=>Response.json({data:{}}));
  assert.equal(pending.outcomes[0].failure_code,'ReceiptPending');
});
test('unexpected provider codes cannot copy arbitrary content into delivery diagnostics',async()=>{
  const {client,outcomes}=fixture([job()]);
  await dispatchPush(client,async()=>Response.json({data:[{status:'error',details:{error:'private-token@example.com'}}]}));
  assert.equal(outcomes[0].failure_code,'ProviderError');
});
