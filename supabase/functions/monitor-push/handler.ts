import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { validDispatchSecret } from '../dispatch-push/push-worker.ts';
import { reportPushHealthAlert, reportServerFailure, sendPushMonitorHeartbeat } from '../_shared/monitoring.ts';
import { monitorPush } from './monitor.ts';

export async function handleMonitorRequest(request:Request) {
  const requestId=crypto.randomUUID();
  const respond=(status:number,body:object)=>Response.json(body,{status,headers:{'X-Request-Id':requestId}});
  if (request.method!=='POST') return respond(405,{error:'Method not allowed'});
  if (!validDispatchSecret(request.headers.get('x-push-dispatch-key'),Deno.env.get('PUSH_DISPATCH_SECRET')))
    return respond(401,{error:'Unauthorized'});
  const url=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  try {
    if (!url || !key) throw new Error('Missing push health configuration');
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await monitorPush(client,requestId,reportPushHealthAlert,sendPushMonitorHeartbeat);
    console.log(JSON.stringify({worker:'monitor-push',requestId,...result}));
    return respond(result.ok ? 200 : 503,result);
  } catch (error) {
    await reportServerFailure('server.push_health',error,requestId);
    return respond(503,{error:'Push monitoring temporarily unavailable'});
  }
}
