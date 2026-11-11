import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {validGeoapifyArea} from '../../../shared/geoapify-area-data.ts';
import {geoapifyPlaces,geoapifyAddressPoint} from '../../../shared/geoapify-place-data.ts';
import {sharedApiCache} from '../_shared/shared-api-cache.ts';

const CATEGORIES='camping,accommodation,tourism,leisure,natural,beach,parking,sport';
export async function handleGeoapifyPlaces(request:Request):Promise<Response> {
  const origin=request.headers.get('origin');
  const allowed=(Deno.env.get('AREAS_ALLOWED_WEB_ORIGINS')??Deno.env.get('PLACES_ALLOWED_WEB_ORIGINS')??'http://localhost:8081,http://127.0.0.1:8081').split(',').map(s=>s.trim());
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
  if(origin&&allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const respond=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.includes(origin))return respond(403,{error:'Origin not allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return respond(405,{error:'Method not allowed'});
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer \S+$/.test(authorization))return respond(401,{error:'Authentication required'});
  try {
    if(Number(request.headers.get('content-length')??0)>3000)return respond(413,{error:'Request too large'});
    const text=await request.text();if(text.length>3000)return respond(413,{error:'Request too large'});
    let input;try{input=JSON.parse(text);}catch{return respond(400,{error:'Invalid request'});}
    if(!input||Array.isArray(input)||!['search','manual-address'].includes(input.action)||Object.keys(input).some(k=>!['action','areaId','query','address','region','country'].includes(k)))return respond(400,{error:'Invalid request'});
    const search=input.action==='search';
    if(search&&(typeof input.query!=='string'||input.query.trim().length<3||input.query.length>160||typeof input.areaId!=='string'||!/^geoapify:[A-Za-z0-9_-]{5,240}$/.test(input.areaId)))return respond(400,{error:'Invalid search'});
    if(!search&&['address','region','country'].some(k=>typeof input[k]!=='string'||input[k].trim().length<2||input[k].length>(k==='address'?300:100)))return respond(400,{error:'Invalid address'});
    const url=Deno.env.get('SUPABASE_URL')!;
    const client=createClient(url,Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY')??Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const user=await client.auth.getUser(authorization.slice(7));if(user.error||!user.data.user)return respond(401,{error:'Authentication required'});
    const budget=await client.rpc('claim_my_place_request');if(budget.error)return respond(budget.error.code==='54000'?429:403,{error:'Search unavailable'});
    const key=Deno.env.get('GEOAPIFY_PLACES_API_KEY')??Deno.env.get('GEOAPIFY_API_KEY');if(!key)return respond(503,{error:'Search unavailable',code:'not_configured'});
    const admin=createClient(url,Deno.env.get('APP_SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    let area;
    if(search){const r=await admin.rpc('get_geoapify_area',{area_id:input.areaId});if(r.error||!validGeoapifyArea(r.data)||r.data.kind!=='locality')return respond(400,{error:'Select a town or village first'});area=r.data;}
    const normalized=search?[input.areaId,input.query.trim().replace(/\s+/g,' ').toLocaleLowerCase('pl-PL')]:[input.address,input.region,input.country].map((s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pl-PL'));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalized)))),b=>b.toString(16).padStart(2,'0')).join('');
    const cacheKey='geoapify:'+(search?'places':'address')+':v1:'+hash;
    const result=await sharedApiCache(admin,cacheKey,async()=>{const r=await admin.rpc('get_geoapify_search_cache',{cache_key:cacheKey});if(r.error)throw Error('Cache unavailable');return r.data;},async()=>{
      let acquired=false;
      for(let i=0;i<10;i++){const r=await admin.rpc('claim_geoapify_provider_request');if(r.error)throw Error('Provider budget unavailable');if(r.data===true){acquired=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
      if(!acquired)throw Error('Provider busy');
      const params=new URLSearchParams(search?{categories:CATEGORIES,filter:'place:'+area!.geoapifyPlaceId,name:normalized[1],lang:'pl',limit:'12',apiKey:key}:
        {text:[input.address,input.region,input.country].join(', '),lang:'pl',format:'json',limit:'5',apiKey:key});
      const response=await fetch('https://api.geoapify.com/'+(search?'v2/places':'v1/geocode/search')+'?'+params,{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Place provider unavailable');
      const data=await response.json();
      if(search)return {areaId:area!.id,places:geoapifyPlaces(data,area!)};
      const geometry=geoapifyAddressPoint(data,input.region,input.country);if(!geometry)throw Error('Address unavailable');return {geometry};
    });
    return respond(200,result as object);
  }catch{return respond(503,{error:'Place search temporarily unavailable'});}
}
