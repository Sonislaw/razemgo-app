import {googlePlaceDetails, GOOGLE_PLACE_ID} from '../../../shared/google-place-data.ts';
import {sharedApiCache, type CacheClient} from './shared-api-cache.ts';

export interface GoogleGeometry {
  placeId: string; latitude: number; longitude: number;
  bounds: {south: number; north: number; west: number; east: number} | null;
  geometryExpiresAt: string;
}
export async function googleGeometry(admin: CacheClient, placeId: string, googleKey: string, refreshBeforeMs = 0): Promise<GoogleGeometry> {
  if (!GOOGLE_PLACE_ID.test(placeId)) throw Error('Invalid place');
  return sharedApiCache(admin, 'places:geometry:' + placeId, async () => {
    const cached = await admin.rpc('get_google_place_geometry', {place_id: placeId});
    if (cached.error) throw Error('Geometry unavailable');
    if (!cached.data || !Number.isFinite(Date.parse(cached.data.geometryExpiresAt)) || Date.parse(cached.data.geometryExpiresAt) - Date.now() <= refreshBeforeMs) return null;
    return {...cached.data, placeId} as GoogleGeometry;
  }, async () => {
    const response = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
      headers: {'X-Goog-Api-Key': googleKey, 'X-Goog-FieldMask': 'id,location,viewport'}, signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error('Geometry provider unavailable');
    const place = googlePlaceDetails(await response.json());
    if (place.googlePlaceId !== placeId) throw Error('Geometry mismatch');
    return {placeId, latitude: place.latitude, longitude: place.longitude, bounds: place.bounds ?? null,
      geometryExpiresAt: new Date(Date.now() + 28 * 86400000).toISOString()};
  });
}
