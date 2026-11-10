import { getSupabase } from '@/lib/supabase';
import { backendLifecycle } from '@/lib/request-lifecycle';
import type { PlacePrediction, SelectedPlace } from '@/types/place';
import { validPlace, PLACE_KINDS, manualPlaceError, isAreaPlaceKind } from './place-data';
import { GOOGLE_PLACE_ID } from '../../../shared/google-place-data';
import { createActivePlaceRequests } from './active-place-requests';

type Geometry = {latitude: number; longitude: number; bounds?: SelectedPlace['bounds']};
const geometryCache = new Map<string, {value: Geometry; expiresAt: number}>();
let cacheSignal: AbortSignal | undefined;
const detailsRequests = createActivePlaceRequests(async (id, signal) => fetchPlaceDetails(id, undefined, signal), {retainedLimit: 100});
const geometryRequests = createActivePlaceRequests(async (placeId, signal) => {
  const data = await placesRequest({action: 'geometry', placeId}, signal);
  const geometry = parseGeometry(data?.place);
  rememberGeometry(placeId, geometry, data?.place?.geometryExpiresAt);
  return geometry;
});
function syncPlaceRequests() {
  const boundary = backendLifecycle.capture();
  if (cacheSignal !== boundary.signal) {
    detailsRequests.clear(); geometryRequests.clear(); geometryCache.clear();
    cacheSignal = boundary.signal;
    boundary.signal.addEventListener('abort', () => {
      if (cacheSignal === boundary.signal) {detailsRequests.clear(); geometryRequests.clear(); geometryCache.clear();}
    }, {once: true});
  }
}
function parseGeometry(place: {latitude?: unknown; longitude?: unknown; bounds?: Geometry['bounds']} | undefined): Geometry {
  if (typeof place?.latitude !== 'number' || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 85 ||
    typeof place.longitude !== 'number' || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180)
    throw Error('Nie udało się odczytać położenia miejsca.');
  return {latitude: place.latitude, longitude: place.longitude, ...(place.bounds ? {bounds: place.bounds} : {})};
}
function rememberGeometry(id: string, value: Geometry, providerExpiry?: string) {
  const expiresAt = Math.min(Date.now() + 30 * 60 * 1000, providerExpiry ? Date.parse(providerExpiry) : Infinity);
  if (!(expiresAt > Date.now())) return;
  if (geometryCache.size >= 64) geometryCache.delete(geometryCache.keys().next().value!);
  geometryCache.set(id, {value, expiresAt});
}
export async function placesRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const boundary = backendLifecycle.capture();
  const result = await getSupabase().functions.invoke('places', { body, signal });
  boundary.assertCurrent();
  if (signal?.aborted) throw Object.assign(Error('Cancelled'), { name:'AbortError' });
  if (result.error) throw Error('Nie udało się pobrać miejsc. Spróbuj ponownie lub dodaj miejsce ręcznie.');
  return result.data;
}
export async function predictPlaces(query:string, mode:string, sessionToken:string, signal?:AbortSignal,areasOnly=false): Promise<PlacePrediction[]> {
  if (query.trim().length < 3) return [];
  const data = await placesRequest({ action:'autocomplete',query,mode,sessionToken,...(areasOnly?{areasOnly:true}:{}) },signal);
  if (!Array.isArray(data?.predictions) || data.predictions.length>8 || data.predictions.some((p:PlacePrediction)=>
    !p||typeof p.id!=='string'||!GOOGLE_PLACE_ID.test(p.id)||typeof p.name!=='string'||!p.name||p.name.length>160||typeof p.context!=='string'||p.context.length>300||!PLACE_KINDS.includes(p.kind))) throw Error('Niepoprawne podpowiedzi miejsc.');
  return areasOnly?data.predictions.filter((p:PlacePrediction)=>isAreaPlaceKind(p.kind)):data.predictions;
}
async function fetchPlaceDetails(placeId:string, sessionToken?:string, signal?:AbortSignal, areasOnly=false): Promise<SelectedPlace> {
  const data = await placesRequest({ action:'details',placeId,...(sessionToken ? {sessionToken} : {}),...(areasOnly?{areasOnly:true}:{}) },signal);
  const place = {...data?.place, userLabel: data?.place?.name};
  if (!validPlace(place) || place.googlePlaceId !== placeId) throw Error('Nie udało się odczytać miejsca.');
  rememberGeometry(placeId, parseGeometry(place));
  return place;
}
export async function resolvePlace(placeId:string, userLabel:string, sessionToken?:string, signal?:AbortSignal,areasOnly=false): Promise<SelectedPlace> {
  syncPlaceRequests();
  const boundary = backendLifecycle.capture();
  // A selection always completes its own Autocomplete session with Google.
  const details = sessionToken ? await fetchPlaceDetails(placeId, sessionToken, signal, areasOnly) : await detailsRequests.read(placeId, signal);
  boundary.assertCurrent();
  if (signal?.aborted) throw Object.assign(Error('Cancelled'), {name: 'AbortError'});
  const place = {...details, userLabel};
  if(areasOnly&&!isAreaPlaceKind(place.kind))throw Error('Wybierz miejscowość, region lub kraj.');
  if (sessionToken) detailsRequests.retain(placeId, details);
  return place;
}
export function observePlaceDetails(place: SelectedPlace, onResolve: (value: SelectedPlace) => void) {
  syncPlaceRequests();
  return detailsRequests.subscribe(place.googlePlaceId!, details => onResolve({...details, userLabel: place.userLabel}));
}
export async function resolvePlaceGeometry(placeId:string, signal?:AbortSignal): Promise<{latitude:number;longitude:number;bounds?:SelectedPlace['bounds']}> {
  syncPlaceRequests();
  const cached = geometryCache.get(placeId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (detailsRequests.has(placeId)) {
    try {
      await detailsRequests.read(placeId, signal);
      const refreshed = geometryCache.get(placeId);
      if (refreshed && refreshed.expiresAt > Date.now()) return refreshed.value;
    }
    catch (error) {if (signal?.aborted) throw error;}
  }
  return geometryRequests.read(placeId, signal);
}
export async function resolveManualPlaceAddress(place:SelectedPlace,signal?:AbortSignal): Promise<SelectedPlace> {
  if(place.source!=='manual'||manualPlaceError(place))throw Error('Niepełny adres miejsca.');
  const data=await placesRequest({action:'manual-address',address:place.address.trim(),region:place.region.trim(),country:place.country.trim()},signal);
  const p=data?.geometry;
  if(typeof p?.placeId!=='string'||!GOOGLE_PLACE_ID.test(p.placeId)||typeof p.latitude!=='number'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>85||
    typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)throw Error('Nie udało się ustalić położenia adresu.');
  return {...place,googlePlaceId:p.placeId,latitude:p.latitude,longitude:p.longitude};
}
export async function ensurePlaceGeometry(userId:string,place:SelectedPlace|undefined,signal?:AbortSignal) {
  if(!userId || !place?.googlePlaceId)return;
  await resolvePlaceGeometry(place.googlePlaceId,signal);
}
