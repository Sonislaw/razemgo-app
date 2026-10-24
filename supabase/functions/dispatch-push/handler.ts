import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { dispatchPush, validDispatchSecret } from './push-worker.ts';
import { reportServerFailure, sendServerMonitoringTest } from '../_shared/monitoring.ts';

export async function handlePushRequest(request: Request) {
  const requestId=crypto.randomUUID();
  const respond = (status: number, body: object) => Response.json(body, { status,headers:{'X-Request-Id':requestId} });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  if (!validDispatchSecret(request.headers.get('x-push-dispatch-key'), Deno.env.get('PUSH_DISPATCH_SECRET')))
    return respond(401, { error: 'Unauthorized' });
  const diagnostic=request.headers.get('x-razemgo-diagnostic');
  if (diagnostic!==null) {
    if (diagnostic!=='sentry-test') return respond(400,{error:'Unknown diagnostic'});
    if (Deno.env.get('SENTRY_ENVIRONMENT')!=='development') return respond(404,{error:'Not found'});
    const result=await sendServerMonitoringTest(requestId);
    const status=result.ok ? result.accepted ? 200 : 503 : result.reason==='rate_limited' ? 429 : 503;
    return respond(status,result);
  }
  const url=Deno.env.get('SUPABASE_URL');
  const secret=Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) { await reportServerFailure('server.dispatch_push',{status:503},requestId); return respond(503, { error: 'Service unavailable' }); }
  try {
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const stats=await dispatchPush(admin,fetch,Deno.env.get('EXPO_ACCESS_TOKEN'));
    // Neither device tokens nor conversation content are included in logs/responses.
    console.log(JSON.stringify({ worker: 'dispatch-push', requestId, ...stats }));
    return respond(200,stats);
  } catch (error) {
    await reportServerFailure('server.dispatch_push',error,requestId);
    return respond(503,{error:'Push dispatch temporarily unavailable'});
  }
}
