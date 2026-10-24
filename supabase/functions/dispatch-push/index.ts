import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { dispatchPush, validDispatchSecret } from './push-worker.ts';

Deno.serve(async (request: Request) => {
  const respond = (status: number, body: object) => Response.json(body, { status });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  if (!validDispatchSecret(request.headers.get('x-push-dispatch-key'), Deno.env.get('PUSH_DISPATCH_SECRET')))
    return respond(401, { error: 'Unauthorized' });
  const url=Deno.env.get('SUPABASE_URL');
  const secret=Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) return respond(503, { error: 'Service unavailable' });
  try {
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const stats=await dispatchPush(admin,fetch,Deno.env.get('EXPO_ACCESS_TOKEN'));
    // Neither device tokens nor conversation content are included in logs/responses.
    console.log(JSON.stringify({ worker: 'dispatch-push', ...stats }));
    return respond(200,stats);
  } catch {
    return respond(503,{error:'Push dispatch temporarily unavailable'});
  }
});
