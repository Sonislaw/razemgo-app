import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readPushHealth,pushHealthAlerts} from '../supabase/functions/monitor-push/health.ts';
import {monitorPush} from '../supabase/functions/monitor-push/monitor.ts';
const healthy=()=>({pending:0,awaiting_receipts:0,in_flight:0,overdue:0,retrying:0,failed_recent:0,credential_errors:0,
  dispatcher_schedule_ok:true,monitor_schedule_ok:true,dispatcher_tick_ok:true});
const lease='00000000-0000-4000-8000-000000000001';
test('health snapshots expose only validated aggregate counters and scheduler flags',()=>{
  const snapshot=readPushHealth({...healthy(),pending:10,token:'private-token',message:'private-message'});
  assert.equal(snapshot.pending,10);assert.equal(JSON.stringify(snapshot).includes('private'),false);
  for (const invalid of [null,{}, {...healthy(),overdue:-1},{...healthy(),pending:'1'},{...healthy(),in_flight:NaN},{...healthy(),dispatcher_tick_ok:'true'}])
    assert.throws(()=>readPushHealth(invalid));
  assert.deepEqual(pushHealthAlerts({...snapshot,pending:100,awaiting_receipts:100}),[]);
});
test('overdue work, credentials, retry exhaustion and scheduler incidents have distinct stable codes',()=>{
  assert.deepEqual(pushHealthAlerts({...healthy(),overdue:1,credential_errors:1,retrying:1,failed_recent:1,dispatcher_schedule_ok:false,dispatcher_tick_ok:false}),
    ['PUSH_QUEUE_STALLED','PUSH_CREDENTIALS','PUSH_RETRIES','PUSH_DELIVERY_FAILURES','PUSH_SCHEDULE_INVALID','PUSH_DISPATCH_STOPPED']);
  assert.deepEqual(pushHealthAlerts({...healthy(),monitor_schedule_ok:false}),['PUSH_SCHEDULE_INVALID']);
});
function fixture(snapshot=healthy(),claims=[]){
  const calls=[],reports=[],beats=[];
  const client={rpc:async(name,args)=>{
    calls.push({name,args});return {data:name==='get_push_health' ? snapshot : name==='claim_push_health_alerts' ? claims : null,error:null};
  }};
  const report=async(code,id)=>{reports.push({code,id});return {accepted:true};};
  const heartbeat=async(ok)=>{beats.push(ok);return {accepted:true,statusCode:200};};
  return {calls,reports,beats,client,report,heartbeat};
}
test('an empty queue still checks scheduler health and sends an independent heartbeat',async()=>{
  const f=fixture();const result=await monitorPush(f.client,lease,f.report,f.heartbeat);
  assert.equal(result.healthy,true);assert.equal(result.ok,true);assert.deepEqual(f.beats,[true]);
  assert.deepEqual(f.calls.map(c=>c.name),['get_push_health','claim_push_health_alerts']);
  assert.deepEqual(f.calls[1].args,{active_codes:[]});
});
test('only leased incidents report and an unsuccessful transport cannot consume the durable cooldown',async()=>{
  const f=fixture({...healthy(),credential_errors:1},[{code:'PUSH_CREDENTIALS',lease}]);
  const result=await monitorPush(f.client,lease,async()=>{throw new Error('Sentry unavailable');},f.heartbeat);
  assert.equal(result.ok,false);assert.equal(result.reporting_failed,1);assert.deepEqual(f.beats,[false]);
  assert.deepEqual(f.calls.at(-1),{name:'finish_push_health_alert',args:{alert_code:'PUSH_CREDENTIALS',claim_lease:lease,accepted:false}});
  const cooling=fixture({...healthy(),credential_errors:1});
  const next=await monitorPush(cooling.client,lease,cooling.report,cooling.heartbeat);
  assert.equal(next.healthy,false);assert.equal(next.ok,true);assert.equal(cooling.reports.length,0);
});
test('accepted alerts persist by lease and monitor failures emit a failed heartbeat',async()=>{
  const f=fixture({...healthy(),overdue:1},[{code:'PUSH_QUEUE_STALLED',lease}]);
  const result=await monitorPush(f.client,lease,f.report,f.heartbeat);
  assert.equal(result.reported,1);assert.equal(f.calls.at(-1).args.accepted,true);
  assert.deepEqual(f.reports,[{code:'PUSH_QUEUE_STALLED',id:lease}]);
  const bad=fixture();bad.client.rpc=async()=>({error:new Error('private backend failure'),data:null});
  await assert.rejects(monitorPush(bad.client,lease,bad.report,bad.heartbeat),/Unable to read push health/);
  assert.deepEqual(bad.beats,[false]);
});
