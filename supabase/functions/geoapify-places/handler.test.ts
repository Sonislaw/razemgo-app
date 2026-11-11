import {handleGeoapifyPlaces} from './handler.ts';
import {cacheFixture} from '../_shared/shared-api-cache.fixture.ts';

Deno.test('planned places authenticate, constrain by canonical area, share searches and retain manual fallback without Google',async()=>{
  const env:Record<string,string>={SUPABASE_URL:'https://backend.invalid',APP_SUPABASE_PUBLISHABLE_KEY:'public-test',APP_SUPABASE_SECRET_KEY:'private-test',GEOAPIFY_API_KEY:'geo-private-test'};
  const previous=Object.keys(env).map(k=>Deno.env.get(k));for(const [k,v] of Object.entries(env))Deno.env.set(k,v);
  const original=globalThis.fetch,cache=cacheFixture('private-test');let providerCalls=0,authenticated=true,fail=false;
  const area={id:'geoapify:area_ustka',geoapifyPlaceId:'area_ustka',source:'geoapify',scope:'area',kind:'locality',name:'Ustka',address:'',region:'pomorskie',country:'Polska',latitude:54.58,longitude:16.86};
  const assert=(value:unknown)=>{if(!value)throw Error('Geoapify boundary failed');};
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json(authenticated?{id:crypto.randomUUID()}:{error:'Invalid'},{status:authenticated?200:401});
    if(url.endsWith('/rpc/claim_my_place_request'))return Response.json(true);
    if(url.endsWith('/rpc/get_geoapify_area')){
      const id=JSON.parse(String(init?.body)).area_id;
      return Response.json(id===area.id?area:['geoapify:area_region','geoapify:area_country'].includes(id)
        ?{...area,id,geoapifyPlaceId:id.slice(9),kind:id.endsWith('region')?'region':'country'}:null);
    }
    const cached=cache.handle(url,init);if(cached)return cached;
    assert(url.startsWith('https://api.geoapify.com/'));providerCalls++;
    const params=new URL(url).searchParams;assert(params.get('apiKey')==='geo-private-test');
    if(fail)return Response.json({error:'geo-private-test'},{status:403});
    if(url.includes('/v2/places')){assert(params.get('filter')==='place:area_ustka');assert(params.get('name')==='camp');
      await new Promise(r=>setTimeout(r,15));return Response.json({features:[{properties:{place_id:'camp_morski',name:'Camping Morski',formatted:'Armii Krajowej 4, Ustka',state:'pomorskie',country:'Polska',lat:54.579,lon:16.862,categories:['camping.camp_site']}}]});}
    assert(url.includes('/v1/geocode/search'));return Response.json({results:[{state:'pomorskie',country:'Polska',lat:54.579,lon:16.862}]});
  };
  const invoke=(body:object,authorization='Bearer test')=>handleGeoapifyPlaces(new Request('https://edge.invalid/geoapify-places',{method:'POST',headers:{authorization},body:JSON.stringify(body)}));
  const body={action:'search',areaId:area.id,query:'Camp'};
  try {
    assert((await invoke(body,'')).status===401);authenticated=false;assert((await invoke(body)).status===401);authenticated=true;
    assert((await invoke({...body,areaId:'geoapify:unknown_area'})).status===400);
    for(const kind of ['region','country'])assert((await invoke({...body,areaId:'geoapify:area_'+kind})).status===400);
    assert((await invoke({...body,query:'Ca'})).status===400);assert((await invoke({...body,latitude:1})).status===400);assert(providerCalls===0);
    const results=await Promise.all(Array.from({length:20},()=>invoke(body)));assert(results.every(r=>r.status===200));assert(providerCalls===1);
    const first=await results[0].json();assert(first.places[0].name==='Camping Morski');assert(first.places[0].areaId===area.id);
    assert((await invoke(body)).status===200);assert(providerCalls===1);
    const manual=await invoke({action:'manual-address',address:'Armii Krajowej 4, Ustka',region:'pomorskie',country:'Polska'});
    assert((await manual.json()).geometry.latitude===54.579);assert(providerCalls===2);
    fail=true;cache.searches.clear();const failed=await invoke(body);assert(failed.status===503);assert(!(await failed.text()).includes('geo-private-test'));
  }finally{globalThis.fetch=original;Object.keys(env).forEach((k,i)=>previous[i]===undefined?Deno.env.delete(k):Deno.env.set(k,previous[i]!));}
});
