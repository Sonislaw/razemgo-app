import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { GOOGLE_PLACE_ID, googlePlaceDetails } from '../../../shared/google-place-data.ts';

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
        const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(id),{
          headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,location,viewport'},signal:AbortSignal.timeout(10000),
        });
        if(!response.ok)throw Error('Provider unavailable');
        const p=googlePlaceDetails(await response.json());
        if(p.googlePlaceId!==id)throw Error('Place mismatch');
        const saved=await admin.rpc('record_google_place_geometry',{place_id:id,latitude:p.latitude,longitude:p.longitude,bounds:p.bounds??null});
        if(saved.error)throw Error('Unavailable');
        refreshed++;
      }));
    }
    return Response.json({refreshed},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Service unavailable'},{status:503});}
}
