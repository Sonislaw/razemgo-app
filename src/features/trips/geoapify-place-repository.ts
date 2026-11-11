import {getSupabase} from '@/lib/supabase';
import {backendLifecycle} from '@/lib/request-lifecycle';
import type {SelectedPlace} from '@/types/place';

async function request(body:object,signal?:AbortSignal) {
  const boundary=backendLifecycle.capture();
  const result=await getSupabase().functions.invoke('geoapify-places',{body,signal});
  boundary.assertCurrent();
  if(signal?.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});
  if(result.error)throw Error('Nie udało się pobrać miejsc.');
  return result.data;
}
export async function resolveGeoapifyManualAddress(place:SelectedPlace,signal?:AbortSignal):Promise<SelectedPlace> {
  const result=await request({action:'manual-address',address:place.address,region:place.region,country:place.country},signal);
  const p=result?.geometry;
  if(typeof p?.latitude!=='number'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>85||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)throw Error('Niepoprawny punkt.');
  return {...place,googlePlaceId:undefined,latitude:p.latitude,longitude:p.longitude,coordinateSource:'address'};
}
