// Geoapify administrative results are persisted independently of Google Places.
export interface GeoapifyArea {
  id: string; source: 'geoapify'; scope: 'area'; geoapifyPlaceId: string;
  kind: 'locality' | 'region' | 'country'; name: string; address: '';
  region: string; country: string; latitude: number; longitude: number;
  bounds?: {south: number; north: number; west: number; east: number};
}
export const GEOAPIFY_AREA_ID = /^[a-zA-Z0-9_-]{5,240}$/;
const text = (value: unknown, max = 160) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const number = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
export function geoapifyAreas(raw: unknown, localitiesOnly = false): GeoapifyArea[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as {results?: unknown}).results)) throw Error('Invalid area response');
  const results: GeoapifyArea[] = [], seen = new Set<string>();
  for (const p of (raw as {results: Record<string, unknown>[]}).results.slice(0, 30)) {
    if (!p || typeof p !== 'object' || !['city', 'state', 'county', 'country', 'district', 'suburb'].includes(String(p.result_type))) continue;
    if (localitiesOnly && p.result_type !== 'city') continue;
    const identifier = text(p.place_id, 240), country = text(p.country, 100), region = text(p.state, 100);
    const kind = p.result_type === 'country' ? 'country' : ['state', 'county'].includes(String(p.result_type)) ? 'region' : 'locality';
    const name = text(p.result_type === 'country' ? p.country : p.result_type === 'state' ? p.state : p.result_type === 'county' ? p.county : p.name || p.city || p.village || p.town || p.address_line1);
    if (!GEOAPIFY_AREA_ID.test(identifier) || !name || !country || !number(p.lat, 85) || !number(p.lon, 180) || seen.has(identifier)) continue;
    const area: GeoapifyArea = {id: 'geoapify:' + identifier, source: 'geoapify', scope: 'area', geoapifyPlaceId: identifier,
      kind, name, address: '', region, country, latitude: p.lat, longitude: p.lon};
    const b = p.bbox as Record<string, unknown> | undefined;
    if (b && number(b.lat1, 90) && number(b.lat2, 90) && number(b.lon1, 180) && number(b.lon2, 180) && b.lat1 <= b.lat2 && b.lon1 <= b.lon2) {
      area.bounds = {south: Math.max(-85, b.lat1), north: Math.min(85, b.lat2), west: b.lon1, east: b.lon2};
    }
    if (!validGeoapifyArea(area)) continue;
    seen.add(identifier); results.push(area);
    if (results.length === 8) break;
  }
  return results;
}
export function validGeoapifyArea(value: unknown): value is GeoapifyArea {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as GeoapifyArea;
  if (p.source !== 'geoapify' || p.scope !== 'area' || !GEOAPIFY_AREA_ID.test(p.geoapifyPlaceId ?? '') || p.id !== 'geoapify:' + p.geoapifyPlaceId ||
    !['locality', 'region', 'country'].includes(p.kind) || !text(p.name) || p.address !== '' || ('googlePlaceId' in p && p.googlePlaceId != null) ||
    typeof p.region !== 'string' || p.region.length > 100 || !text(p.country, 100) || !number(p.latitude, 85) || !number(p.longitude, 180)) return false;
  const b = p.bounds;
  return !b || (number(b.south, 85) && number(b.north, 85) && number(b.west, 180) && number(b.east, 180) && b.south <= b.north && b.west <= b.east);
}
