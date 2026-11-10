import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {parseGoogleForecast, parseGoogleAlerts, selectTripWeather, weatherAvailability, type WeatherForecast} from '../../../shared/trip-weather.ts';
import {GOOGLE_PLACE_ID, googlePlaceDetails} from '../../../shared/google-place-data.ts';

export async function handleTripWeather(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('WEATHER_ALLOWED_WEB_ORIGINS') ?? Deno.env.get('PLACES_ALLOWED_WEB_ORIGINS') ?? 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(s => s.trim());
  const headers: Record<string, string> = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin'};
  if (origin && allowed.includes(origin)) Object.assign(headers, {'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS'});
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), {status, headers});
  if (origin && !allowed.includes(origin)) return respond(403, {error: 'Origin not allowed'});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (request.method !== 'POST') return respond(405, {error: 'Method not allowed'});
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(authorization)) return respond(401, {error: 'Authentication required'});
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 1000) return respond(413, {error: 'Request too large'});
    const raw = await request.text();
    if (raw.length > 1000) return respond(413, {error: 'Request too large'});
    let input;
    try {input = JSON.parse(raw);} catch {return respond(400, {error: 'Invalid request'});}
    if (!input || Array.isArray(input) || Object.keys(input).some(k => k !== 'tripId') ||
      typeof input.tripId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.tripId)) return respond(400, {error: 'Invalid trip'});
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {headers: {Authorization: authorization}}, auth: {persistSession: false, autoRefreshToken: false},
    });
    const user = await client.auth.getUser(authorization.slice(7));
    if (user.error || !user.data.user) return respond(401, {error: 'Authentication required'});
    const context = await client.rpc('get_my_trip_weather_context', {target_trip_id: input.tripId});
    if (context.error) return respond(context.error.code === '54000' ? 429 : 403, {error: 'Weather unavailable'});
    if (!context.data) return respond(404, {error: 'Trip unavailable'});
    const trip = context.data;
    const availability = weatherAvailability(trip.start_date, trip.end_date);
    if (availability) return respond(200, {state: availability});
    if (['region', 'country'].includes(trip.place_kind)) return respond(200, {state: 'area'});
    const key = Deno.env.get('GOOGLE_WEATHER_API_KEY');
    if (!key) return respond(503, {error: 'Weather unavailable', code: 'not_configured'});
    const admin = createClient(url, Deno.env.get('APP_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    let {latitude, longitude} = trip;
    if (latitude === null && typeof trip.google_place_id === 'string' && GOOGLE_PLACE_ID.test(trip.google_place_id)) {
      const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
      if (!placesKey) return respond(200, {state: 'needs_location'});
      const response = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(trip.google_place_id), {
        headers: {'X-Goog-Api-Key': placesKey, 'X-Goog-FieldMask': 'id,location,viewport'}, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('Location unavailable');
      const place = googlePlaceDetails(await response.json());
      if (place.googlePlaceId !== trip.google_place_id) throw Error('Location mismatch');
      latitude = place.latitude; longitude = place.longitude;
      const saved = await admin.rpc('record_google_place_geometry', {place_id: trip.google_place_id, latitude, longitude, bounds: place.bounds ?? null});
      if (saved.error) throw Error('Location unavailable');
    }
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 85 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return respond(200, {state: 'needs_location'});
    const cacheKey = latitude.toFixed(5) + ',' + longitude.toFixed(5) + ':pl:v1';
    const cached = await admin.rpc('get_trip_weather_cache', {cache_key: cacheKey});
    if (cached.error) throw Error('Cache unavailable');
    let forecast: WeatherForecast | null = cached.data;
    if (!forecast) {
      const google = async (endpoint: string, extra: Record<string, string> = {}) => {
        const params = new URLSearchParams({'location.latitude': String(latitude), 'location.longitude': String(longitude), languageCode: 'pl', ...extra});
        const response = await fetch('https://weather.googleapis.com/v1/' + endpoint + '?' + params, {
          headers: {'X-Goog-Api-Key': key}, signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw Error('Weather provider unavailable');
        return response.json();
      };
      const alerts = (async () => {
        try {
          const result: ReturnType<typeof parseGoogleAlerts> = []; let token: string | undefined;
          for (let page = 0; page < 3; page++) {
            const data = await google('publicAlerts:lookup', {pageSize: '100', ...(token ? {pageToken: token} : {})});
            result.push(...parseGoogleAlerts(data)); token = data.nextPageToken;
            if (!token) return {alerts: result, alertsAvailable: true};
          }
          return {alerts: result, alertsAvailable: false};
        } catch {return {alerts: [], alertsAvailable: false};}
      })();
      const daily = await google('forecast/days:lookup', {days: '10', pageSize: '10', unitsSystem: 'METRIC'});
      forecast = {...parseGoogleForecast(daily), ...await alerts, fetchedAt: new Date().toISOString()};
      const saved = await admin.rpc('put_trip_weather_cache', {cache_key: cacheKey, forecast});
      if (saved.error) throw Error('Cache unavailable');
    }
    return respond(200, selectTripWeather(forecast, trip.start_date, trip.end_date));
  } catch {return respond(503, {error: 'Weather temporarily unavailable'});}
}
