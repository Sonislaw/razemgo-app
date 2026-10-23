import { POLISH_LOCALITIES } from '../../data/locations/polish-localities.ts';
import type { LocationOption } from '../../types/location';
import type { TripPlan } from '../../types/travel';
import {
  findTripLocation,
  searchTripLocations,
  tripLocationIdForPlace,
} from './trip-locations.ts';

export interface MapArea {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}
export interface TripMapTarget {
  kind: 'place' | 'area';
  query: string;
  label: string;
  area?: MapArea;
}

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
const areaCache = new Map<string, MapArea | undefined>();

// Natural regions have no administrative boundary in the locality dictionary.
// These circles are deliberately approximate, anchored to a named locality.
const naturalRegions = new Map<
  string,
  { anchor: string; radiusMeters: number }
>([
  ['kaszuby', { anchor: 'Kartuzy', radiusMeters: 55000 }],
  ['sudety', { anchor: 'Jelenia Góra', radiusMeters: 100000 }],
  ['bory tucholskie', { anchor: 'Tuchola', radiusMeters: 45000 }],
]);

function regionArea(location: LocationOption): MapArea | undefined {
  if (areaCache.has(location.id)) return areaCache.get(location.id);
  const province = location.id.startsWith('pl-region:')
    ? POLISH_LOCALITIES.provinces.indexOf(
        location.id.slice('pl-region:'.length),
      )
    : -1;
  const rows =
    location.id === 'country:PL'
      ? POLISH_LOCALITIES.places
      : POLISH_LOCALITIES.places.filter((row) => row[3] === province);
  let area: MapArea | undefined;
  if (rows.length) {
    let south = Infinity,
      north = -Infinity,
      west = Infinity,
      east = -Infinity;
    for (const row of rows) {
      south = Math.min(south, row[6]);
      north = Math.max(north, row[6]);
      west = Math.min(west, row[7]);
      east = Math.max(east, row[7]);
    }
    const latitude = (north + south) / 2;
    area = {
      latitude,
      longitude: (east + west) / 2,
      // Circumscribed circle around the locality bounds; not an official border.
      radiusMeters: Math.max(
        3000,
        Math.hypot(
          ((north - south) * 111320) / 2,
          ((east - west) * 111320 * Math.cos((latitude * Math.PI) / 180)) / 2,
        ),
      ),
    };
  }
  areaCache.set(location.id, area);
  return area;
}

function approximateArea(location?: LocationOption): MapArea | undefined {
  if (!location) return undefined;
  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
    return {
      latitude: location.latitude!,
      longitude: location.longitude!,
      radiusMeters: 3000,
    };
  const natural = naturalRegions.get(normalize(location.name));
  if (natural) {
    const anchor = searchTripLocations(natural.anchor, 'planned').find(
      (item) => normalize(item.name) === normalize(natural.anchor),
    );
    if (anchor?.latitude !== undefined && anchor.longitude !== undefined)
      return {
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        radiusMeters: natural.radiusMeters,
      };
  }
  // Broad preview of Slovenia, the other country in the current location picker.
  if (location.id === 'demo-location-slowenia')
    return { latitude: 46.15, longitude: 14.99, radiusMeters: 150000 };
  return regionArea(location);
}

export function getTripMapTarget(trip: TripPlan): TripMapTarget | undefined {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  if (!place.name.trim()) return undefined;
  const location = findTripLocation(tripLocationIdForPlace(place));
  const context = [
    place.name,
    location?.commune && location.commune !== place.name
      ? location.commune
      : '',
    location?.county ? 'powiat ' + location.county : '',
    location?.region || place.region,
    location?.country,
  ].filter(Boolean);
  const details =
    trip.mode === 'planned'
      ? [trip.campgroundName?.trim(), trip.campgroundAddress?.trim()].filter(
          Boolean,
        )
      : [];
  return {
    kind: details.length ? 'place' : 'area',
    label: details.length ? details.join(' · ') : place.name,
    query: [...details, ...new Set(context)].join(', '),
    ...(details.length
      ? {}
      : {
          area: approximateArea(
            location ?? {
              ...place,
              id: 'legacy:' + normalize(place.name),
              country: '',
              kind: 'region',
            },
          ),
        }),
  };
}

export function areaViewport(area: MapArea, width: number, height = 260) {
  const baseResolution =
    156543.03392 * Math.cos((area.latitude * Math.PI) / 180);
  const availableDiameter = Math.max(100, Math.min(width, height) * 0.7);
  const zoom = Math.max(
    2,
    Math.min(
      15,
      Math.floor(
        Math.log2(
          (availableDiameter * baseResolution) / (2 * area.radiusMeters),
        ),
      ),
    ),
  );
  return {
    zoom,
    diameter: (2 * area.radiusMeters) / (baseResolution / 2 ** zoom),
  };
}

export function googleMapsSearchUrl(target: TripMapTarget): string {
  if (target.kind === 'area' && target.area) {
    const { latitude, longitude } = target.area;
    return (
      'https://www.google.com/maps/@?api=1&map_action=map&center=' +
      latitude +
      ',' +
      longitude +
      '&zoom=' +
      areaViewport(target.area, 350).zoom
    );
  }
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(target.query)
  );
}

export function googleMapsEmbedUrl(
  target: TripMapTarget,
  width: number,
): string {
  const base = 'https://maps.google.com/maps?hl=pl&t=m&output=embed';
  if (target.kind === 'area' && target.area) {
    const { latitude, longitude } = target.area;
    return (
      base +
      '&ll=' +
      latitude +
      ',' +
      longitude +
      '&z=' +
      areaViewport(target.area, width).zoom
    );
  }
  // Google resolves a campground/address itself. A locality coordinate is never
  // substituted for the campground's actual position.
  return base + '&q=' + encodeURIComponent(target.query);
}
