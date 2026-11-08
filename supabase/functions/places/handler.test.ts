import { handlePlaces } from './handler.ts';

Deno.test('Places authenticates, enforces budgets and hides the server key while preserving sessions and details', async () => {
  const values: Record<string,string> = { SUPABASE_URL:'https://backend.invalid',
    APP_SUPABASE_PUBLISHABLE_KEY:'test-public', APP_SUPABASE_SECRET_KEY:'test-server', GOOGLE_PLACES_API_KEY:'private-google-test' };
  const previous = Object.keys(values).map(key => Deno.env.get(key));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const calls: { url:string; init?:RequestInit }[] = [];
  let authenticated = true, limited = false, googleFailure = false;
  const id = 'ChIJ_camp', session = crypto.randomUUID();
  const assert = (value: unknown) => { if (!value) throw Error('Places boundary failed'); };
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return Response.json(authenticated ? { id: crypto.randomUUID() } : { message:'invalid' }, { status: authenticated ? 200 : 401 });
    if (url.endsWith('/rest/v1/rpc/claim_my_place_request')) return limited ? Response.json({ code:'54000',message:'limit' }, { status:400 }) : Response.json(null);
    if (url.endsWith('/rest/v1/rpc/record_google_place_geometry')) {
      assert(new Headers(init?.headers).get('apikey') === 'test-server');
      const data = JSON.parse(String(init?.body));
      assert(Object.keys(data).sort().join(',') === 'bounds,latitude,longitude,place_id');
      return Response.json(null);
    }
    if (url.startsWith('https://places.googleapis.com/')) {
      assert(new Headers(init?.headers).get('X-Goog-Api-Key') === 'private-google-test');
      if (googleFailure) return Response.json({ error:{ message:'do not leak private-google-test' } }, { status:403 });
      if (url.includes('places:autocomplete')) {
        const data = JSON.parse(String(init?.body)); assert(data.sessionToken === session);
        return Response.json({ suggestions:[{ placePrediction:{ placeId:id, types:['campground'], structuredFormat:{ mainText:{text:'Kemping'}, secondaryText:{text:'Adres'} } } }] });
      }
      assert(new URL(url).searchParams.get('sessionToken') === session);
      return Response.json({ id, location:{latitude:54,longitude:18}, displayName:{text:'Kemping'}, formattedAddress:'Adres', types:['campground'] });
    }
    throw Error('Unexpected transport');
  };
  const invoke = (body:object, headers:Record<string,string>={ authorization:'Bearer test' }) => handlePlaces(new Request('https://edge.invalid/places', {
    method:'POST',headers,body:JSON.stringify(body),
  }));
  try {
    assert((await invoke({action:'autocomplete',query:'Camp'},{})).status === 401);
    assert((await invoke({action:'autocomplete',query:'Camp'},{origin:'https://foreign.invalid',authorization:'Bearer test'})).status === 403);
    assert((await invoke({action:'details',placeId:'../secrets'})).status === 400);
    assert(calls.length === 0);
    authenticated = false;
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session})).status === 401);
    authenticated = true; limited = true;
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session})).status === 429);
    assert(calls.every(call => !call.url.includes('googleapis')));
    limited = false;
    const predictions = await invoke({action:'autocomplete',query:'Camp',sessionToken:session});
    assert(predictions.status === 200 && predictions.headers.get('cache-control') === 'no-store');
    assert((await predictions.json()).predictions[0].kind === 'campground');
    const details = await invoke({action:'details',placeId:id,sessionToken:session});
    assert(details.status === 200 && (await details.json()).place.address === 'Adres');
    googleFailure = true;
    const failed = await invoke({action:'details',placeId:id,sessionToken:session});
    assert(failed.status === 503 && !(await failed.text()).includes('private-google-test'));
  } finally {
    globalThis.fetch = original;
    Object.keys(values).forEach((key,i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});
