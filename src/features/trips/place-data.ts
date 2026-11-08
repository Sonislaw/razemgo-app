import type { SelectedPlace } from '../../types/place';
import type { LocationOption } from '../../types/location';
import { findTripLocation } from './trip-locations.ts';
import { validPlace } from '../../lib/place-format.ts';
export { PLACE_KINDS, PLACE_KIND_LABELS, validPlace, storePlace, readPlace, placeSearchRadiusKm, manualPlaceError } from '../../lib/place-format.ts';
export function placeLocation(place?: SelectedPlace, legacyId?: string): LocationOption | undefined {
  if (!place || !validPlace(place)) return findTripLocation(legacyId);
  return { id:place.id, name:place.source==='google' ? place.userLabel! : place.name, region:place.source==='manual' ? place.region : '',
    country:place.source==='manual' ? place.country : '', kind:place.kind==='region'||place.kind==='country' ? place.kind : 'locality',
    ...(place.latitude!=null && place.longitude!=null ? { latitude:place.latitude, longitude:place.longitude } : {}) };
}
