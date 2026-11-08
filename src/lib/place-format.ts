import type { SelectedPlace } from '../types/place';
import { GOOGLE_PLACE_ID } from '../../shared/google-place-data.ts';

export const PLACE_KINDS = ['locality','campground','place','region','country'] as const;
export const PLACE_KIND_LABELS = { locality:'Miejscowość', campground:'Kemping', place:'Miejsce', region:'Region', country:'Kraj' };
export function validPlace(value: unknown): value is SelectedPlace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as SelectedPlace;
  if (!PLACE_KINDS.includes(p.kind) || typeof p.name !== 'string' || !p.name.trim() || p.name.length>160 ||
    typeof p.address !== 'string' || p.address.length>300 || typeof p.region !== 'string' || p.region.length>100 ||
    typeof p.country !== 'string' || p.country.length>100 || typeof p.id !== 'string' || p.id.length>263) return false;
  if (p.source==='google') return typeof p.googlePlaceId==='string' && GOOGLE_PLACE_ID.test(p.googlePlaceId) &&
    p.id==='google:'+p.googlePlaceId && typeof p.userLabel==='string' && !!p.userLabel.trim() && p.userLabel.length<=160;
  if (p.source!=='manual' || !/^manual:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.id)) return false;
  if (p.googlePlaceId!=null && (typeof p.googlePlaceId!=='string'||!GOOGLE_PLACE_ID.test(p.googlePlaceId))) return false;
  return (p.latitude==null && p.longitude==null) || (typeof p.latitude==='number' && Number.isFinite(p.latitude) &&
    Math.abs(p.latitude)<=85 && typeof p.longitude==='number' && Number.isFinite(p.longitude) && Math.abs(p.longitude)<=180);
}
export function manualPlaceError(p: Pick<SelectedPlace,'name'|'address'|'region'|'country'|'latitude'|'longitude'|'googlePlaceId'>): string {
  if (!p.name.trim()) return 'Podaj nazwę miejsca.';
  const point = !p.googlePlaceId&&typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&
    typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
  return point || [p.address,p.region,p.country].every(value=>value.trim().length>=2) ? '' :
    'Uzupełnij adres miejsca, region i kraj lub wskaż punkt na mapie.';
}
// Names/addresses returned by Google are view state. Only its ID, category and
// the user's original description are stored with a trip or saved filter.
export function storePlace(p: SelectedPlace): SelectedPlace {
  if (!validPlace(p)) throw Error('Invalid place');
  return p.source==='google' ? { id:p.id, source:'google', kind:p.kind, googlePlaceId:p.googlePlaceId,
    userLabel:p.userLabel!.trim(), name:p.userLabel!.trim(), address:'', region:'', country:'' } :
    { id:p.id, source:'manual', kind:p.kind, name:p.name.trim(), address:p.address.trim(), region:p.region.trim(), country:p.country.trim(),
      ...(p.googlePlaceId ? {googlePlaceId:p.googlePlaceId} :
        p.latitude!=null && p.longitude!=null ? { latitude:p.latitude, longitude:p.longitude } : {}) };
}
export function readPlace(value: unknown): SelectedPlace | undefined { return validPlace(value) ? storePlace(value) : undefined; }
export const placeSearchRadiusKm = (kind: SelectedPlace['kind']) => kind==='country' ? 700 : kind==='region' ? 150 : kind==='locality' ? 20 : 1;
