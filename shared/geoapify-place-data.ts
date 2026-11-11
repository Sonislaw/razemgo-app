import { GEOAPIFY_AREA_ID, type GeoapifyArea } from './geoapify-area-data.ts';

export interface GeoapifyPlace {
  id: string; source: 'geoapify'; scope: 'place'; geoapifyPlaceId: string; areaId: string;
  kind: 'campground' | 'place'; name: string; address: string; region: string; country: string;
  latitude: number; longitude: number;
}
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const coordinate = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
export function validGeoapifyPlace(value: unknown): value is GeoapifyPlace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as GeoapifyPlace;
  return p.source === 'geoapify' && p.scope === 'place' && GEOAPIFY_AREA_ID.test(p.geoapifyPlaceId ?? '') &&
    p.id === 'geoapify:' + p.geoapifyPlaceId && typeof p.areaId === 'string' && p.areaId.startsWith('geoapify:') &&
    GEOAPIFY_AREA_ID.test(p.areaId.slice(9)) && ['campground','place'].includes(p.kind) &&
    typeof p.name === 'string' && !!p.name.trim() && p.name.length <= 160 &&
    typeof p.address === 'string' && p.address.length <= 300 && typeof p.region === 'string' && p.region.length <= 100 &&
    typeof p.country === 'string' && !!p.country.trim() && p.country.length <= 100 &&
    coordinate(p.latitude,85) && coordinate(p.longitude,180) && !('googlePlaceId' in p && p.googlePlaceId != null);
}
export function geoapifyPlaces(raw: unknown, area: GeoapifyArea): GeoapifyPlace[] {
  const features = (raw as {features?: unknown[]})?.features;
  if (!Array.isArray(features)) throw Error('Invalid places');
  const results: GeoapifyPlace[] = [], seen = new Set<string>();
  for (const value of features.slice(0,30)) {
    const p = (value as {properties?: Record<string, unknown>})?.properties;
    if (!p) continue;
    if(typeof p.place_id!=='string'||p.place_id.trim().length>240)continue;
    const id = p.place_id.trim(), name = text(p.name,160);
    if (!GEOAPIFY_AREA_ID.test(id) || !name || seen.has(id) || !coordinate(p.lat,85) || !coordinate(p.lon,180)) continue;
    const categories = Array.isArray(p.categories) ? p.categories : [];
    const place: GeoapifyPlace = {id:'geoapify:'+id,geoapifyPlaceId:id,source:'geoapify',scope:'place',areaId:area.id,
      kind:categories.some(c=>typeof c==='string'&&(c==='camping'||c.startsWith('camping.')))?'campground':'place',
      name,address:text(p.formatted || [p.address_line1,p.address_line2].filter(Boolean).join(', '),300),
      region:text(p.state || area.region,100),country:text(p.country || area.country,100),latitude:p.lat,longitude:p.lon};
    if (validGeoapifyPlace(place)) {results.push(place);seen.add(id);}
    if (results.length === 8) break;
  }
  return results;
}
export function geoapifyAddressPoint(raw: unknown, region: string, country: string) {
  const normalize = (v:string) => v.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/\b(wojewodztwo|woj|region|state|province)\b/g,'').replace(/[^a-z0-9]/g,'');
  const countryKey = (v:string) => ['pl','polska','poland'].includes(normalize(v)) ? 'pl' : normalize(v);
  const rows = (raw as {results?: Record<string,unknown>[]})?.results;
  if (!Array.isArray(rows)) throw Error('Invalid address');
  return rows.flatMap(p => {
    const r = normalize(text(p.state,100)), expected = normalize(region);
    if (!coordinate(p.lat,85) || !coordinate(p.lon,180) || !expected || !r || !(r.includes(expected)||expected.includes(r)) ||
      ![p.country,p.country_code].some(c=>typeof c==='string'&&countryKey(c)===countryKey(country))) return [];
    return [{latitude:p.lat,longitude:p.lon}];
  })[0];
}
