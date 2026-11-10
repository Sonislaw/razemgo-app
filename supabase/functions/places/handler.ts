import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { GOOGLE_PLACE_ID, googlePlaceDetails, googlePlacePredictions, manualAddressGeometry, isAreaPlaceKind } from '../../../shared/google-place-data.ts';
import { validDispatchSecret } from '../dispatch-push/push-worker.ts';
import { maintainPlaceGeometry } from './maintenance.ts';
import { googleGeometry } from '../_shared/google-geometry.ts';

export async function handlePlaces(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('PLACES_ALLOWED_WEB_ORIGINS') ?? 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(value => value.trim());
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' });
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return respond(403, { error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  if(request.headers.has('x-push-dispatch-key')) {
    if(!validDispatchSecret(request.headers.get('x-push-dispatch-key'),Deno.env.get('PUSH_DISPATCH_SECRET')))return respond(401,{error:'Authentication required'});
    return maintainPlaceGeometry();
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(authorization)) return respond(401, { error: 'Authentication required' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret = Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 4000) return respond(413, { error: 'Request too large' });
    const raw = await request.text();
    if (raw.length > 4000) return respond(413, { error: 'Request too large' });
    let input;
    try { input = JSON.parse(raw); } catch { return respond(400, { error: 'Invalid request' }); }
    if (!input || Array.isArray(input) || !['autocomplete', 'details', 'geometry', 'refresh', 'manual-address'].includes(input.action)) return respond(400, { error: 'Invalid action' });
    if(input.areasOnly!=null&&typeof input.areasOnly!=='boolean')return respond(400,{error:'Invalid area selector'});
    if(input.action==='manual-address'&&['address','region','country'].some(k=>typeof input[k]!=='string'||input[k].trim().length<2||input[k].length>(k==='address'?300:100)))
      return respond(400,{error:'Complete address required'});
    const token = input.sessionToken;
    if (token != null && (typeof token !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token))) return respond(400, { error: 'Invalid session' });
    if (input.action === 'autocomplete' && (typeof input.query !== 'string' || input.query.trim().length < 3 || input.query.length > 160 || !token))
      return respond(400, { error: 'Invalid query' });
    if (['details','geometry'].includes(input.action) && (typeof input.placeId !== 'string' || !GOOGLE_PLACE_ID.test(input.placeId)))
      return respond(400, { error: 'Invalid place' });
    const client = createClient(url, publicKey, { global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false } });
    const user = await client.auth.getUser(authorization.slice(7));
    if (user.error || !user.data.user) return respond(401, { error: 'Authentication required' });
    const budget = await client.rpc('claim_my_place_request');
    if (budget.error) return respond(budget.error.code === '54000' ? 429 : 403, { error: 'Request unavailable' });
    if (!googleKey) return respond(503, { error: 'Places service unavailable', code: 'not_configured' });
    const google = async (endpoint: string, fields: string, body?: object) => {
      const response = await fetch(endpoint, { method: body ? 'POST' : 'GET', headers: {
        'X-Goog-Api-Key': googleKey, 'X-Goog-FieldMask': fields, ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Object.assign(Error('Provider unavailable'), { status: response.status });
      return response.json();
    };
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const details = async (id: string, session?: string, minimal = false) => {
      const params = new URLSearchParams({ languageCode: 'pl', regionCode: 'pl', ...(session ? { sessionToken: session } : {}) });
      const raw = await google('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?' + params,
        minimal ? 'id,location,viewport' : 'id,displayName,formattedAddress,addressComponents,location,viewport,types');
      const place = googlePlaceDetails(raw);
      if (place.googlePlaceId !== id) throw Error('Place mismatch');
      const saved = await admin.rpc('record_google_place_geometry', { place_id: id, latitude: place.latitude, longitude: place.longitude, bounds:place.bounds??null });
      if (saved.error) throw Error('Geometry unavailable');
      return place;
    };
    if (input.action === 'autocomplete') {
      const raw = await google('https://places.googleapis.com/v1/places:autocomplete',
        'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
        { input: input.query.trim(), languageCode: 'pl', regionCode: 'pl', includeQueryPredictions: false,
          ...(input.areasOnly?{includedPrimaryTypes:['(regions)']} : {}),
          ...(token ? { sessionToken: token } : {}) });
      return respond(200, { predictions: googlePlacePredictions(raw).filter(p => input.areasOnly?isAreaPlaceKind(p.kind):input.mode!=='planned'||!['region','country'].includes(p.kind)) });
    }
    if (input.action === 'details') {
      const place=await details(input.placeId,token);
      if(input.areasOnly&&!isAreaPlaceKind(place.kind))return respond(422,{error:'Choose a locality, region or country',code:'area_required'});
      return respond(200,{place});
    }
    if (input.action === 'geometry') {
      return respond(200, {place: await googleGeometry(admin, input.placeId, googleKey)});
    }
    if(input.action==='manual-address') {
      const raw=await google('https://places.googleapis.com/v1/places:searchText','places.id,places.location,places.viewport,places.addressComponents',
        {textQuery:[input.address.trim(),input.region.trim(),input.country.trim()].join(', '),languageCode:'pl',regionCode:'pl',pageSize:3});
      const geometry=manualAddressGeometry(raw,input.region,input.country);
      if(!geometry)return respond(422,{error:'Address not found',code:'address_not_found'});
      const saved=await admin.rpc('record_google_place_geometry',{place_id:geometry.placeId,latitude:geometry.latitude,longitude:geometry.longitude,bounds:geometry.bounds??null});
      if(saved.error)throw Error('Geometry unavailable');
      return respond(200,{geometry});
    }
    const pending = await client.rpc('list_my_map_place_refreshes');
    if (pending.error) return respond(403, { error: 'Unavailable' });
    let refreshed = 0;
    for (const id of pending.data ?? []) { await googleGeometry(admin, id, googleKey, 3 * 86400000); refreshed++; }
    return respond(200, { refreshed });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : 503;
    return respond(status === 429 ? 429 : 503, { error: 'Places service unavailable' });
  }
}
