import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {geoapifyAreas} from '../../../shared/geoapify-area-data.ts';
import {sharedApiCache} from '../_shared/shared-api-cache.ts';

export async function handleSearchAreas(request: Request): Promise<Response> {
  const origin=request.headers.get('origin');
  const allowed=(Deno.env.get('AREAS_ALLOWED_WEB_ORIGINS')??Deno.env.get('PLACES_ALLOWED_WEB_ORIGINS')??'http://localhost:8081,http://127.0.0.1:8081').split(',').map(value=>value.trim());
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
  if(origin&&allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const respond=(status:number,data:object)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!allowed.includes(origin))return respond(403,{error:'Origin not allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return respond(405,{error:'Method not allowed'});
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer \S+$/.test(authorization))return respond(401,{error:'Authentication required'});
  try {
    if(Number(request.headers.get('content-length')??0)>1500)return respond(413,{error:'Request too large'});
    const text=await request.text();if(text.length>1500)return respond(413,{error:'Request too large'});
    let input;try{input=JSON.parse(text);}catch{return respond(400,{error:'Invalid request'});}
    if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['query','localitiesOnly'].includes(key))||
      (input.localitiesOnly!==undefined&&typeof input.localitiesOnly!=='boolean')||typeof input.query!=='string'||input.query.trim().length<3||input.query.length>160)
      return respond(400,{error:'Invalid query'});
    const url=Deno.env.get('SUPABASE_URL')!;
    const client=createClient(url,Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY')??Deno.env.get('SUPABASE_ANON_KEY')!,
      {global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const user=await client.auth.getUser(authorization.slice(7));
    if(user.error||!user.data.user)return respond(401,{error:'Authentication required'});
    const budget=await client.rpc('claim_my_place_request');
    if(budget.error)return respond(budget.error.code==='54000'?429:403,{error:'Search unavailable'});
    const key=Deno.env.get('GEOAPIFY_API_KEY');if(!key)return respond(503,{error:'Search unavailable',code:'not_configured'});
    const admin=createClient(url,Deno.env.get('APP_SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const query=input.query.trim().replace(/\s+/g,' ').toLocaleLowerCase('pl-PL');
    const localitiesOnly=input.localitiesOnly===true;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([localitiesOnly?'city':'locality',query])))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const cacheKey='geoapify:autocomplete:pl:v1:'+hash;
    const result=await sharedApiCache(admin,cacheKey,async()=>{
      const cached=await admin.rpc('get_geoapify_search_cache',{cache_key:cacheKey});
      if(cached.error)throw Error('Area cache unavailable');return cached.data as {areas: ReturnType<typeof geoapifyAreas>}|null;
    },async()=>{
      let acquired=false;
      for(let attempt=0;attempt<10;attempt++){
        const slot=await admin.rpc('claim_geoapify_provider_request');if(slot.error)throw Error('Provider budget unavailable');
        if(slot.data===true){acquired=true;break;}await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!acquired)throw Error('Provider busy');
      const params=new URLSearchParams({text:query,type:localitiesOnly?'city':'locality',lang:'pl',limit:'12',format:'json',bias:'countrycode:pl',apiKey:key});
      const response=await fetch('https://api.geoapify.com/v1/geocode/autocomplete?'+params,{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Area provider unavailable');
      return {areas:geoapifyAreas(await response.json(),localitiesOnly)};
    });
    return respond(200,result);
  }catch{return respond(503,{error:'Area search temporarily unavailable'});}
}
