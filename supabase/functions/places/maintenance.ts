import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { GOOGLE_PLACE_ID } from '../../../shared/google-place-data.ts';
import { googleGeometry } from '../_shared/google-geometry.ts';

export async function maintainPlaceGeometry() {
  const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('APP_SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),key=Deno.env.get('GOOGLE_PLACES_API_KEY');
  if(!url||!secret||!key)return Response.json({error:'Service unavailable'},{status:503});
  try {
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const pending=await admin.rpc('list_google_place_refreshes');
    if(pending.error||!Array.isArray(pending.data))throw Error('Unavailable');
    let refreshed=0;
    for(let offset=0;offset<Math.min(20,pending.data.length);offset+=4) {
      await Promise.all(pending.data.slice(offset,offset+4).map(async(id:unknown)=>{
        if(typeof id!=='string'||!GOOGLE_PLACE_ID.test(id))throw Error('Invalid place');
        await googleGeometry(admin,id,key,3*86400000);
        refreshed++;
      }));
    }
    return Response.json({refreshed},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Service unavailable'},{status:503});}
}
