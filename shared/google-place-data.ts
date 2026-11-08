// Provider data stays transient. Only IDs and time-limited geometry are cached.
export const GOOGLE_PLACE_ID = /^[A-Za-z0-9_-]{5,256}$/;
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.slice(0, limit) : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
export function placeKind(types: string[]): 'locality' | 'campground' | 'place' | 'region' | 'country' {
  if (types.some(type => ['campground', 'rv_park', 'camping'].includes(type))) return 'campground';
  if (types.includes('country')) return 'country';
  if (types.some(type => ['administrative_area_level_1', 'administrative_area_level_2'].includes(type))) return 'region';
  if (types.some(type => ['locality', 'postal_town', 'sublocality'].includes(type))) return 'locality';
  return 'place';
}
export function googlePlacePredictions(raw: unknown) {
  const suggestions = object(raw).suggestions;
  return (Array.isArray(suggestions) ? suggestions : []).flatMap(suggestion => {
    const p = object(object(suggestion).placePrediction), format = object(p.structuredFormat);
    if (typeof p.placeId !== 'string' || !GOOGLE_PLACE_ID.test(p.placeId)) return [];
    const name = text(object(format.mainText).text, 160);
    return name ? [{ id: p.placeId, name, context: text(object(format.secondaryText).text, 300), kind: placeKind(strings(p.types)) }] : [];
  }).slice(0, 8);
}
export function googlePlaceDetails(raw: unknown) {
  const p = object(raw), location = object(p.location), lat = location.latitude, lng = location.longitude;
  if (typeof p.id !== 'string' || !GOOGLE_PLACE_ID.test(p.id) ||
    typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 85 ||
    typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) throw Error('Invalid place');
  const components = Array.isArray(p.addressComponents) ? p.addressComponents.map(object) : [];
  const component = (type: string) => components.find(c => strings(c.types).includes(type)) ?? {};
  const viewport=object(p.viewport), low=object(viewport.low), high=object(viewport.high);
  const bounds=typeof low.latitude==='number'&&typeof low.longitude==='number'&&typeof high.latitude==='number'&&typeof high.longitude==='number'&&
    [low.latitude,low.longitude,high.latitude,high.longitude].every(Number.isFinite)&&low.latitude<high.latitude&&low.longitude<high.longitude&&
    low.longitude>=-180&&high.longitude<=180 ? {south:Math.max(-85,low.latitude),north:Math.min(85,high.latitude),west:low.longitude,east:high.longitude}:undefined;
  return { id: 'google:' + p.id, googlePlaceId: p.id, source: 'google' as const,
    kind: placeKind(strings(p.types)), name: text(object(p.displayName).text, 160), address: text(p.formattedAddress, 300),
    region: text(component('administrative_area_level_1').longText, 100),
    country: text(component('country').shortText, 2), latitude: lat, longitude: lng, ...(bounds&&bounds.south<bounds.north?{bounds}:{}), resolvedAt: new Date().toISOString() };
}
export function manualAddressGeometry(raw:unknown,region:string,country:string) {
  const normalize=(value:string)=>value.toLocaleLowerCase('pl-PL').replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(wojewodztwo|woj|province|region|state)\b/g,'').replace(/[^a-z0-9]/g,'');
  const countryKey=(value:string)=>['pl','polska','poland'].includes(normalize(value))?'pl':normalize(value);
  const places=object(raw).places;
  for(const item of Array.isArray(places)?places:[]) {
    const p=object(item),components=Array.isArray(p.addressComponents)?p.addressComponents.map(object):[];
    const component=(type:string)=>components.find(c=>strings(c.types).includes(type))??{};
    const nation=component('country'),area=component('administrative_area_level_1');
    const countries=[text(nation.longText,100),text(nation.shortText,100)].map(countryKey);
    const areas=[text(area.longText,100),text(area.shortText,100)].map(normalize),requested=normalize(region);
    if(!countries.includes(countryKey(country))||requested.length<2||!areas.some(value=>value.length>=2&&(value.includes(requested)||requested.includes(value))))continue;
    try {
      const place=googlePlaceDetails(p);
      return {placeId:place.googlePlaceId,latitude:place.latitude,longitude:place.longitude,bounds:place.bounds};
    } catch { /* A malformed candidate is never used as a map point. */ }
  }
  return undefined;
}
