import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_WEB_ORIGINS') ?? 'http://localhost:8081').split(',').map((item) => item.trim());
  const headers = new Headers({ 'Content-Type': 'application/json', 'Vary': 'Origin' });
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
  if (!url || !key || !secret) return respond(503, { error: 'Service unavailable' });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Network validation also rejects deleted users with otherwise unexpired JWTs.
    const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !data.user) return respond(401, { error: 'Authentication required' });
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    // The target comes exclusively from the validated JWT; request bodies are ignored.
    const deleted = await admin.auth.admin.deleteUser(data.user.id);
    if (deleted.error) return respond(500, { error: 'Account deletion failed' });
    return respond(200, { deleted: true });
  } catch { return respond(503, { error: 'Service unavailable' }); }
});
