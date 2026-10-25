import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePushTarget, pushDestination, pushNavigationReady } from '../src/features/notifications/push-data.ts';
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
test('all three payloads contain generic copy, identifiers, stable collapse/tag and no private message text',()=>{
  for(const kind of ['invitation_received','invitation_accepted','message']){
    const payload=pushMessage(job({kind}));assert.ok(payload.title);assert.ok(payload.body);
    assert.equal(payload.channelId,'razemgo-contact');assert.equal(payload.data.recipientGroupId,group);
    assert.equal(payload.tag,payload.collapseId);assert.equal(payload.data.url,undefined);
    assert.equal(Object.keys(payload.data).includes('text'),false);
    assert.ok(parsePushTarget(payload.data));
  }
});
test('cold-start notification navigation waits for restoration, onboarding and authentication redirects',()=>{
  assert.equal(pushNavigationReady(false,'root','/'),false);
  assert.equal(pushNavigationReady(true,undefined,'/'),false);
  for(const pathname of ['/account-loading','/welcome','/onboarding','/auth/callback','/auth/sign-in','/auth/reset-password'])
    assert.equal(pushNavigationReady(true,'root',pathname),false);
  assert.equal(pushNavigationReady(true,'root','/'),true);
  assert.equal(pushNavigationReady(true,'root','/messages'),true);
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
