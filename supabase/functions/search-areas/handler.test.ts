import {handleSearchAreas} from './handler.ts';
import {cacheFixture} from '../_shared/shared-api-cache.fixture.ts';

Deno.test('Geoapify area proxy authenticates, limits, filters and shares queries across users without Google calls or exposed credentials',async()=>{
  const values:Record<string,string>={SUPABASE_URL:'https://backend.invalid',APP_SUPABASE_PUBLISHABLE_KEY:'public-test',APP_SUPABASE_SECRET_KEY:'server-test',GEOAPIFY_API_KEY:'private-geoapify-test'};
  const previous=Object.keys(values).map(key=>Deno.env.get(key));Object.entries(values).forEach(([key,value])=>Deno.env.set(key,value));
  const original=globalThis.fetch,cache=cacheFixture('server-test');let authenticated=true,limited=false,providerFailure=false,providerCalls=0;
  const assert=(value:unknown)=>{if(!value)throw Error('Area proxy boundary failed');};
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json(authenticated?{id:crypto.randomUUID()}:{message:'invalid'},{status:authenticated?200:401});
    if(url.endsWith('/rpc/claim_my_place_request'))return limited?Response.json({code:'54000'},{status:400}):Response.json(null);
    const cached=cache.handle(url,init);if(cached)return cached;
    if(url.startsWith('https://api.geoapify.com/v1/geocode/autocomplete?')){
      providerCalls++;await new Promise(resolve=>setTimeout(resolve,20));
      const params=new URL(url).searchParams;assert(params.get('apiKey')===values.GEOAPIFY_API_KEY&&params.get('type')==='locality'&&params.get('lang')==='pl');
      if(providerFailure)return Response.json({error:values.GEOAPIFY_API_KEY},{status:403});
      const row={place_id:'51abcd12345',name:'Kozienice',city:'Kozienice',result_type:'city',country:'Polska',state:'Mazowieckie',lat:51.58,lon:21.55};
      return Response.json({results:[row,{...row,result_type:'amenity',place_id:'51camp12345'},{...row,result_type:'street',place_id:'51street123'}]});
    }
    throw Error('Unexpected transport, including any Google call');
  };
  const invoke=(body:object={query:'Kozienice'},headers:Record<string,string>={authorization:'Bearer test'})=>handleSearchAreas(new Request('https://edge.invalid/search-areas',{method:'POST',headers,body:JSON.stringify(body)}));
  try {
    assert((await invoke({},{})).status===401);assert((await invoke({query:'Ko'})).status===400);
    assert((await invoke({query:'Kozienice',url:'https://foreign.invalid'})).status===400);
    assert((await invoke({}, {authorization:'Bearer test',origin:'https://foreign.invalid'})).status===403);
    authenticated=false;assert((await invoke()).status===401);authenticated=true;limited=true;assert((await invoke()).status===429);limited=false;
    assert(providerCalls===0);
    const results=await Promise.all(Array.from({length:20},(_,i)=>invoke({query:i%2?' KOZIENICE ':'Kozienice'})));
    assert(results.every(response=>response.status===200&&response.headers.get('cache-control')==='no-store'));
    const payloads=await Promise.all(results.map(response=>response.json()));
    assert(providerCalls===1&&payloads.every(p=>p.areas.length===1&&p.areas[0].name==='Kozienice'&&p.areas[0].source==='geoapify'));
    await invoke();assert(providerCalls===1);
    providerFailure=true;const failed=await invoke({query:'inne miejsce'});
    assert(failed.status===503&&!(await failed.text()).includes('private-geoapify-test'));
    await invoke({query:'inne miejsce'});assert(providerCalls===2);
    Deno.env.delete('GEOAPIFY_API_KEY');assert((await (await invoke()).json()).code==='not_configured');
  }finally {globalThis.fetch=original;Object.keys(values).forEach((key,i)=>previous[i]===undefined?Deno.env.delete(key):Deno.env.set(key,previous[i]!));}
});
