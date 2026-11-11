import {cacheFixture} from '../_shared/shared-api-cache.fixture.ts';
import { handlePlaces } from './handler.ts';

Deno.test('Places authenticates, enforces budgets and hides the server key while preserving sessions and details', async () => {
  const values: Record<string,string> = { SUPABASE_URL:'https://backend.invalid',
    APP_SUPABASE_PUBLISHABLE_KEY:'test-public', APP_SUPABASE_SECRET_KEY:'test-server', GOOGLE_PLACES_API_KEY:'private-google-test' };
  const previous = Object.keys(values).map(key => Deno.env.get(key));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const calls: { url:string; init?:RequestInit }[] = [];
  let authenticated = true, limited = false, googleFailure = false, missingAddress = false;
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
      if(url.includes('places:searchText')) {
        const data=JSON.parse(String(init?.body));assert(data.textQuery==='Leśna 4, Ustka, pomorskie, Polska');
        assert(!new Headers(init?.headers).get('X-Goog-FieldMask')?.includes('displayName'));
        return Response.json({places:missingAddress?[]:[{id,location:{latitude:54,longitude:18},addressComponents:[
          {longText:'Polska',shortText:'PL',types:['country']},{longText:'Województwo pomorskie',shortText:'Pomorskie',types:['administrative_area_level_1']},
        ]}]});
      }
      if (url.includes('places:autocomplete')) {
        const data = JSON.parse(String(init?.body)); assert(data.sessionToken === session);
        assert(data.includedPrimaryTypes===undefined);
        return Response.json({ suggestions:[
          { placePrediction:{ placeId:id, types:['campground'], structuredFormat:{ mainText:{text:'Kemping'}, secondaryText:{text:'Adres'} } } },
          { placePrediction:{ placeId:'ChIJ_country', types:['country'], structuredFormat:{ mainText:{text:'Polska'}, secondaryText:{text:''} } } },
        ] });
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
    assert((await invoke({action:'autocomplete',query:'Ca',sessionToken:session})).status === 400);
    assert((await invoke({action:'autocomplete',query:'Camp'})).status === 400);
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session,areasOnly:true})).status===400);
    assert((await invoke({action:'details',placeId:id,sessionToken:session,areasOnly:true})).status===400);
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session,mode:'invalid'})).status===400);
    assert((await invoke({action:'manual-address',address:'Leśna 4',region:'',country:'Polska'})).status===400);
    assert(calls.length === 0);
    authenticated = false;
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session})).status === 401);
    authenticated = true; limited = true;
    assert((await invoke({action:'autocomplete',query:'Camp',sessionToken:session})).status === 429);
    assert(calls.every(call => !call.url.includes('googleapis')));
    limited = false;
    const predictions = await invoke({action:'autocomplete',query:'Camp',sessionToken:session,mode:'planned'});
    assert(predictions.status === 200 && predictions.headers.get('cache-control') === 'no-store');
    const rows=(await predictions.json()).predictions;assert(rows.length===1&&rows[0].kind === 'campground');
    const details = await invoke({action:'details',placeId:id,sessionToken:session});
    assert(details.status === 200 && (await details.json()).place.address === 'Adres');
    // The general discovery filter still searches countries through Google.
    const filter=await invoke({action:'autocomplete',query:'Polska',sessionToken:session,mode:'flexible'});
    const filterRows=(await filter.json()).predictions;assert(filterRows.length===2&&filterRows[1].kind==='country');
    const address={action:'manual-address',address:'Leśna 4, Ustka',region:'pomorskie',country:'Polska'};
    const located=await invoke(address);assert(located.status===200);
    const geometry=(await located.json()).geometry;assert(geometry.placeId===id&&geometry.latitude===54&&geometry.longitude===18);
    missingAddress=true;const absent=await invoke(address);assert(absent.status===422&&(await absent.json()).code==='address_not_found');missingAddress=false;
    googleFailure = true;
    const failed = await invoke({action:'details',placeId:id,sessionToken:session});
    assert(failed.status === 503 && !(await failed.text()).includes('private-google-test'));
  } finally {
    globalThis.fetch = original;
    Object.keys(values).forEach((key,i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});

Deno.test('Geometry uses the existing server cache and calls Google only when geometry is missing', async () => {
  const values: Record<string, string> = {SUPABASE_URL: 'https://backend.invalid', APP_SUPABASE_PUBLISHABLE_KEY: 'public-test',
    APP_SUPABASE_SECRET_KEY: 'server-test', GOOGLE_PLACES_API_KEY: 'google-test'};
  const previous = Object.keys(values).map(key => Deno.env.get(key));
  Object.entries(values).forEach(([key, value]) => Deno.env.set(key, value));
  const original = globalThis.fetch;
  let googleCalls = 0, authenticated = true;
  const cache = cacheFixture('server-test');
  const assert = (value: unknown) => {if (!value) throw Error('Geometry optimization failed');};
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json(authenticated ? {id: crypto.randomUUID()} : {message: 'invalid'}, {status: authenticated ? 200 : 401});
    if (url.endsWith('/rest/v1/rpc/claim_my_place_request')) return Response.json(null);
    const cached = cache.handle(url, init); if (cached) return cached;
    if (url.startsWith('https://places.googleapis.com/')) {
      await new Promise(resolve => setTimeout(resolve, 15));
      googleCalls++; assert(new Headers(init?.headers).get('X-Goog-FieldMask') === 'id,location,viewport');
      return Response.json({id: 'ChIJ_cached', location: {latitude: 54, longitude: 18}});
    }
    throw Error('Unexpected transport');
  };
  const invoke = () => handlePlaces(new Request('https://edge.invalid/places', {method: 'POST', headers: {authorization: 'Bearer test'},
    body: JSON.stringify({action: 'geometry', placeId: 'ChIJ_cached'})}));
  try {
    const first = await invoke(); assert(first.status === 200 && (await first.json()).place.latitude === 54); assert(googleCalls === 1);
    const second = await invoke(); assert(second.status === 200 && (await second.json()).place.longitude === 18); assert(googleCalls === 1);
    authenticated = false; assert((await invoke()).status === 401); assert(googleCalls === 1); authenticated = true;
    cache.geometry.clear();
    const parallel = await Promise.all(Array.from({length: 20}, () => invoke()));
    assert(parallel.every(response => response.status === 200)); assert(googleCalls === 2);
  } finally {
    globalThis.fetch = original;
    Object.keys(values).forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});
