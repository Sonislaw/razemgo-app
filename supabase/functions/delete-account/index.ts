import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { reportServerFailure } from '../_shared/monitoring.ts';

Deno.serve(async (request: Request) => {
  const requestId=crypto.randomUUID();
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_WEB_ORIGINS') ?? 'http://localhost:8081').split(',').map((item) => item.trim());
  const headers = new Headers({ 'Content-Type': 'application/json', 'Vary': 'Origin' });
  headers.set('X-Request-Id',requestId);
  headers.set('Access-Control-Expose-Headers','X-Request-Id');
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return respond(403, { error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, { error: 'Authentication required' });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const secret = Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !secret) { await reportServerFailure('server.delete_account',{status:503},requestId); return respond(503, { error: 'Service unavailable' }); }
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Network validation also rejects deleted users with otherwise unexpired JWTs.
    const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !data.user) {
      if (error && ![400,401,403,404].includes(error.status ?? 0)) { await reportServerFailure('server.delete_account',error,requestId); return respond(503,{error:'Service unavailable'}); }
      return respond(401, { error: 'Authentication required' });
    }
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    // The target comes exclusively from the validated JWT; request bodies are ignored.
    const deleted = await admin.auth.admin.deleteUser(data.user.id);
    if (deleted.error) { await reportServerFailure('server.delete_account',deleted.error,requestId); return respond(500, { error: 'Account deletion failed' }); }
    return respond(200, { deleted: true });
  } catch (error) { await reportServerFailure('server.delete_account',error,requestId); return respond(503, { error: 'Service unavailable' }); }
});
