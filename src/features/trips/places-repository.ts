import { getSupabase } from '@/lib/supabase';
import { backendLifecycle } from '@/lib/request-lifecycle';
import type { PlacePrediction, SelectedPlace } from '@/types/place';
import { validPlace, PLACE_KINDS } from './place-data';
import { GOOGLE_PLACE_ID } from '../../../shared/google-place-data';
export async function placesRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const boundary = backendLifecycle.capture();
  const result = await getSupabase().functions.invoke('places', { body, signal });
  boundary.assertCurrent();
  if (signal?.aborted) throw Object.assign(Error('Cancelled'), { name:'AbortError' });
  if (result.error) throw Error('Nie udało się pobrać miejsc. Spróbuj ponownie lub dodaj miejsce ręcznie.');
  return result.data;
}
export async function predictPlaces(query:string, mode:string, sessionToken:string, signal?:AbortSignal): Promise<PlacePrediction[]> {
  const data = await placesRequest({ action:'autocomplete',query,mode,sessionToken },signal);
  if (!Array.isArray(data?.predictions) || data.predictions.length>8 || data.predictions.some((p:PlacePrediction)=>
    !p||typeof p.id!=='string'||!GOOGLE_PLACE_ID.test(p.id)||typeof p.name!=='string'||!p.name||p.name.length>160||typeof p.context!=='string'||p.context.length>300||!PLACE_KINDS.includes(p.kind))) throw Error('Niepoprawne podpowiedzi miejsc.');
  return data.predictions;
}
export async function resolvePlace(placeId:string, userLabel:string, sessionToken?:string, signal?:AbortSignal): Promise<SelectedPlace> {
  const data = await placesRequest({ action:'details',placeId,...(sessionToken ? {sessionToken} : {}) },signal);
  const place = { ...data?.place, userLabel };
  if (!validPlace(place)) throw Error('Nie udało się odczytać miejsca.');
  return place;
}
export async function resolvePlaceGeometry(placeId:string, signal?:AbortSignal): Promise<{latitude:number;longitude:number;bounds?:SelectedPlace['bounds']}> {
  const data=await placesRequest({action:'geometry',placeId},signal),p=data?.place;
  if(typeof p?.latitude!=='number'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>85||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)
    throw Error('Nie udało się odczytać położenia miejsca.');
  return {latitude:p.latitude,longitude:p.longitude,...(p.bounds?{bounds:p.bounds}:{})};
}
const geometryChecks=new Map<string,number>();
export async function ensurePlaceGeometry(userId:string,place:SelectedPlace|undefined,signal?:AbortSignal) {
  if(place?.source!=='google'||!place.googlePlaceId)return;
  const key=userId+':'+place.id;
  if(Date.now()-(geometryChecks.get(key)??0)<30*60*1000)return;
  await resolvePlaceGeometry(place.googlePlaceId,signal);
  if(geometryChecks.size>=64)geometryChecks.delete(geometryChecks.keys().next().value!);
  geometryChecks.set(key,Date.now());
}
