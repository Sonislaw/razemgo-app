import {cacheFixture} from '../_shared/shared-api-cache.fixture.ts';
import {handleTripWeather} from './handler.ts';

Deno.test('Weather authenticates and authorizes trips before provider requests; respects dates, cache and provider failures without leaking keys', async () => {
  const values: Record<string, string> = {SUPABASE_URL: 'https://backend.invalid', APP_SUPABASE_PUBLISHABLE_KEY: 'public-test',
    APP_SUPABASE_SECRET_KEY: 'private-test', GOOGLE_WEATHER_API_KEY: 'weather-private-test', GOOGLE_PLACES_API_KEY: 'places-private-test'};
  const previous = Object.keys(values).map(key => Deno.env.get(key));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const calls: string[] = [];
  const today = new Date().toISOString().slice(0, 10), day = new Date(today);
  let trip: Record<string, unknown> | null = {start_date: today, end_date: today, place_kind: 'campground', latitude: 54, longitude: 18, google_place_id: 'ChIJ_camp'};
  let authenticated = true, limited = false, providerFailure = false, alertsFailure = false;
  const cache = cacheFixture('private-test');
  const assert = (value: unknown) => {if (!value) throw Error('Weather boundary failed');};
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('/auth/v1/user')) return Response.json(authenticated ? {id: crypto.randomUUID()} : {message: 'invalid'}, {status: authenticated ? 200 : 401});
    if (url.endsWith('/rest/v1/rpc/get_my_trip_weather_context')) return limited ? Response.json({code: '54000'}, {status: 400}) : Response.json(trip);
    const cached = cache.handle(url, init); if (cached) return cached;
    if (url.startsWith('https://places.googleapis.com/')) {
      assert(new Headers(init?.headers).get('X-Goog-Api-Key') === 'places-private-test');
      return Response.json({id: 'ChIJ_camp', location: {latitude: 54, longitude: 18}});
    }
    if (url.startsWith('https://weather.googleapis.com/')) {
      await new Promise(resolve => setTimeout(resolve, 15));
      assert(new Headers(init?.headers).get('X-Goog-Api-Key') === 'weather-private-test');
      assert(!url.includes('weather-private-test'));
      if (providerFailure) return Response.json({error: 'weather-private-test'}, {status: 403});
      if (url.includes('publicAlerts')) return alertsFailure ? Response.json({}, {status: 503}) : Response.json({weatherAlerts: []});
      const params = new URL(url).searchParams;
      assert(params.get('pageSize') === '10' && params.get('unitsSystem') === 'METRIC' && params.get('languageCode') === 'pl');
      return Response.json({timeZone: {id: 'UTC'}, forecastDays: [{displayDate: {year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate()},
        minTemperature: {degrees: 5}, maxTemperature: {degrees: 12}, daytimeForecast: {weatherCondition: {type: 'CLEAR', description: {text: 'Słonecznie'}}}}]});
    }
    throw Error('Unexpected transport');
  };
  const invoke = (body: object = {tripId: '00000000-0000-4000-8000-000000000123'}, headers: Record<string, string> = {authorization: 'Bearer test'}) =>
    handleTripWeather(new Request('https://edge.invalid/weather', {method: 'POST', headers, body: JSON.stringify(body)}));
  const providerCalls = () => calls.filter(url => url.includes('googleapis.com')).length;
  try {
    assert((await invoke({}, {})).status === 401);
    assert((await invoke({}, {authorization: 'Bearer test', origin: 'https://foreign.invalid'})).status === 403);
    assert((await invoke({tripId: '../private'})).status === 400);
    assert((await invoke({tripId: '00000000-0000-4000-8000-000000000123', latitude: 54})).status === 400);
    assert(calls.length === 0);
    authenticated = false; assert((await invoke()).status === 401); authenticated = true;
    limited = true; assert((await invoke()).status === 429); limited = false;
    const saved = trip; trip = null; assert((await invoke()).status === 404); trip = saved;
    trip = {...saved, start_date: '2099-05-01', end_date: '2099-05-04'};
    assert((await (await invoke()).json()).state === 'future');
    trip = {...saved, place_kind: 'region'}; assert((await (await invoke()).json()).state === 'area');
    assert(providerCalls() === 0);
    trip = saved;
    const response = await invoke(); const data = await response.json();
    assert(response.status === 200 && response.headers.get('cache-control') === 'no-store' && data.state === 'forecast');
    assert(data.days[0].maxC === 12 && data.alertsAvailable === true && data.partial === false);
    assert(providerCalls() === 2);
    await invoke(); assert(providerCalls() === 2);
    // Independent authorized requests must share provider refreshes, not just a JS promise.
    cache.components.clear(); calls.length = 0;
    const parallel = await Promise.all(Array.from({length: 20}, () => invoke()));
    assert(parallel.every(response => response.status === 200));
    const parallelData = await Promise.all(parallel.map(response => response.json()));
    assert(parallelData.every(result => result.days[0].maxC === 12));
    assert(providerCalls() === 2);
    const dailyBefore = parallelData[0].fetchedAt;
    for (const key of cache.components.keys()) if (key.startsWith('alerts:')) cache.components.delete(key);
    const refreshedAlerts = await (await invoke()).json();
    assert(providerCalls() === 3 && refreshedAlerts.fetchedAt === dailyBefore && refreshedAlerts.alertsFetchedAt);
    for (const key of cache.components.keys()) if (key.startsWith('forecast:')) cache.components.delete(key);
    await invoke(); assert(providerCalls() === 4);
    cache.components.clear(); alertsFailure = true;
    assert((await (await invoke()).json()).alertsAvailable === false); alertsFailure = false;
    cache.components.clear(); cache.leases.clear(); trip = {...saved, latitude: null, longitude: null};
    assert((await (await invoke()).json()).state === 'forecast');
    cache.components.clear(); cache.leases.clear(); providerFailure = true;
    const failed = await invoke(); assert(failed.status === 503 && !(await failed.text()).includes('private-test'));
    providerFailure = false; Deno.env.delete('GOOGLE_WEATHER_API_KEY');
    assert((await (await invoke()).json()).code === 'not_configured');
  } finally {
    globalThis.fetch = original;
    Object.keys(values).forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});
