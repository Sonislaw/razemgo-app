import { PUSH_HEALTH_CODES, readPushHealth, pushHealthAlerts, type PushHealthCode } from './health.ts';
type RpcClient={rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
type Report=(code:PushHealthCode,requestId:string)=>Promise<{accepted:boolean}>;
type Heartbeat=(success:boolean)=>Promise<{accepted:boolean;statusCode:number|null}>;

// Injected transports keep the safety and lease behavior testable without
// calling Expo, Sentry, or a real Supabase project.
export async function monitorPush(client:RpcClient,requestId:string,report:Report,heartbeat:Heartbeat) {
  try {
    const snapshot=await client.rpc('get_push_health');
    if (snapshot.error) throw new Error('Unable to read push health');
    const health=readPushHealth(snapshot.data);
    const codes=pushHealthAlerts(health);
    const claimed=await client.rpc('claim_push_health_alerts',{active_codes:codes});
    if (claimed.error || !Array.isArray(claimed.data)) throw new Error('Unable to claim push health alerts');
    let reported=0;let failed=0;
    for (const item of claimed.data) {
      if (!item || typeof item!=='object' || !PUSH_HEALTH_CODES.includes(item.code) || !/^[a-f\d-]{36}$/i.test(item.lease))
        throw new Error('Invalid health alert claim');
      let accepted=false;
      try { accepted=(await report(item.code,requestId)).accepted; } catch { /* Release lease for a later retry. */ }
      const saved=await client.rpc('finish_push_health_alert',{alert_code:item.code,claim_lease:item.lease,accepted});
      if (saved.error) throw new Error('Unable to persist health alert outcome');
      if (accepted) reported++;else failed++;
    }
    // Health incidents create their own issues. The cron heartbeat tracks the
    // monitor's ability to inspect and report, including when the queue is empty.
    const checkIn=await heartbeat(failed===0);
    return {healthy:codes.length===0,codes,health,reported,reporting_failed:failed,heartbeat_accepted:checkIn.accepted,
      heartbeat_http_status:checkIn.statusCode,ok:failed===0 && checkIn.accepted};
  } catch (error) {
    try {await heartbeat(false);} catch { /* A missing heartbeat is externally detectable. */ }
    throw error;
  }
}
