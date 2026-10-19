import { DEMO_LOCATIONS } from '../../data/mocks/locations.ts';
import type { LocationOption } from '../../types/location';
import type { TripPlace } from '../../types/travel';

export const LOCATION_KIND_LABELS: Record<LocationOption['kind'], string> = {
  locality: 'Miejscowość',
  region: 'Region',
  country: 'Kraj',
};
export const TRIP_LOCATION_REQUIRED_ERROR =
  'Wybierz lokalizację z podpowiedzi — miejscowość, region lub kraj.';

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function findTripLocation(id?: string): LocationOption | undefined {
  return DEMO_LOCATIONS.find((location) => location.id === id);
}

export function searchTripLocations(query: string): LocationOption[] {
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  return DEMO_LOCATIONS.filter((location) => {
    const text = normalize(
      [
        location.name,
        location.region,
        location.country,
        ...(location.aliases ?? []),
      ].join(' '),
    );
    return terms.every((term) => text.includes(term));
  });
}

export function locationContext(location: LocationOption): string {
  return location.kind === 'country'
    ? 'Cały kraj'
    : [location.region, location.country].filter(Boolean).join(', ');
}

export function tripLocationIdForPlace(place: TripPlace): string {
  return (
    findTripLocation(place.locationId)?.id ??
    DEMO_LOCATIONS.find(
      (location) =>
        normalize(location.name) === normalize(place.name) &&
        normalize(location.region) === normalize(place.region),
    )?.id ??
    ''
  );
}
