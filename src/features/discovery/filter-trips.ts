import type {
  DateRange,
  DiscoveryFilters,
  TripPlan,
  TripMode,
  TripProposal,
  TripPlace,
} from '../../types/travel';
import type { LocationOption } from '../../types/location';
import { isValidDate } from '../trips/own-trips-state.ts';
import {
  findTripLocation,
  tripLocationIdForPlace,
} from '../trips/trip-locations.ts';

export const INITIAL_FILTERS: DiscoveryFilters = {
  favoritesOnly: false,
  tripModes: ['planned', 'flexible'],
  dateRangeId: 'all',
  location: '',
  childAgeBands: [],
  animalKinds: [],
  landscapeKinds: [],
};
export function selectDiscoveryLocation(
  filters: DiscoveryFilters,
  id: string,
): DiscoveryFilters {
  const location = findTripLocation(id);
  return {
    ...filters,
    locationId: location?.id,
    location: location?.name ?? '',
  };
}
export function updateDiscoveryLocationQuery(
  filters: DiscoveryFilters,
  query: string,
): DiscoveryFilters {
  return { ...filters, locationId: undefined, location: query };
}

// Older demo areas use geographic names instead of province names.
const LEGACY_DEMO_PROVINCES: Record<string, string> = {
  pomorze: 'pomorskie',
  'dolny slask': 'dolnośląskie',
};
function matchesSelectedLocation(
  place: TripPlace,
  selected: LocationOption,
): boolean {
  const candidate =
    findTripLocation(tripLocationIdForPlace(place)) ??
    findTripLocation(
      'pl-region:' +
        (LEGACY_DEMO_PROVINCES[normalizeLocation(place.region)] ??
          place.region.toLocaleLowerCase('pl-PL')),
    );
  if (!candidate) return false;
  if (selected.kind === 'country')
    return (
      normalizeLocation(candidate.country) ===
      normalizeLocation(selected.country)
    );
  if (selected.kind === 'region')
    return (
      selected.id === candidate.id ||
      normalizeLocation(selected.name) === normalizeLocation(candidate.region)
    );
  return selected.id === candidate.id;
}
export function clearDiscoveryDates(
  filters: DiscoveryFilters,
): DiscoveryFilters {
  return {
    ...filters,
    dateRangeId: 'all',
    customDateRange: undefined,
    dateFlexibilityDays: 0,
  };
}
export function updateDiscoveryDateRange(
  filters: DiscoveryFilters,
  range: DateRange,
  tolerance = 0,
): DiscoveryFilters {
  return {
    ...filters,
    dateRangeId: 'custom',
    customDateRange: { ...range },
    dateFlexibilityDays: Number.isFinite(tolerance)
      ? Math.min(7, Math.max(0, Math.trunc(tolerance)))
      : 0,
  };
}
export function getDiscoveryDateRangeError(
  range?: DateRange,
): string | undefined {
  if (!range) return undefined;
  if (!range.startDate || !range.endDate)
    return 'Uzupełnij obie daty: „Od” i „Do”.';
  if (!isValidDate(range.startDate) || !isValidDate(range.endDate))
    return 'Wybierz poprawne daty.';
  if (range.endDate <= range.startDate)
    return 'Data „Do” musi przypadać po dacie „Od”.';
  return undefined;
}
export function toggleDiscoveryTripMode(
  modes: TripMode[],
  mode: TripMode,
): TripMode[] {
  return modes.includes(mode)
    ? modes.length === 1
      ? modes
      : modes.filter((item) => item !== mode)
    : [...modes, mode];
}
export function normalizeLocation(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
export function sharedNights(a: DateRange, b: DateRange): number {
  // UTC calendar boundaries avoid daylight-saving and device-timezone differences.
  const start = Math.max(Date.parse(a.startDate), Date.parse(b.startDate));
  const end = Math.min(Date.parse(a.endDate), Date.parse(b.endDate));
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, (end - start) / 86_400_000)
    : 0;
}
export function getTripLocation(trip: TripPlan): string {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  return [place.name, place.region].filter(Boolean).join(', ');
}
export function filterProposals(
  proposals: TripProposal[],
  filters: DiscoveryFilters,
  dateRange?: DateRange,
  favoriteTripIds: ReadonlySet<string> = new Set(),
): TripProposal[] {
  const location = normalizeLocation(filters.location);
  const selectedLocation = findTripLocation(filters.locationId);
  if (
    filters.dateRangeId !== 'all' &&
    getDiscoveryDateRangeError(filters.customDateRange)
  )
    return [];
  const range = dateRange ?? resolveDiscoveryRange(filters);
  const matching = proposals.filter(({ trip, group }) => {
    if (filters.favoritesOnly && !favoriteTripIds.has(trip.id)) return false;
    if (!filters.tripModes.includes(trip.mode)) return false;
    if (
      filters.landscapeKinds?.length &&
      !filters.landscapeKinds.includes(trip.landscape)
    )
      return false;
    const reference = getDiscoveryReferenceRange(filters, range, trip);
    if (reference && sharedNights(trip, reference) <= 0) return false;
    if (filters.groupKinds?.length && !filters.groupKinds.includes(group.kind))
      return false;
    const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
    // Keep searches from earlier demo plans compatible with the province name.
    const legacyRegion = /^(pomorze|pomorskie)$/iu.test(place.region)
      ? 'Pomorze Pomorskie'
      : '';
    if (
      selectedLocation
        ? !matchesSelectedLocation(place, selectedLocation)
        : location &&
          !normalizeLocation(
            getTripLocation(trip) + ' ' + legacyRegion,
          ).includes(location)
    )
      return false;
    if (
      filters.childAgeBands.length &&
      !(trip.participants?.childAgeBands ?? []).some((band) => filters.childAgeBands.includes(band))
    )
      return false;
    if (
      filters.animalKinds?.length &&
      !trip.animals.animals.some((animal) =>
        filters.animalKinds!.includes(animal.kind),
      )
    )
      return false;
    return true;
  });
  return matching;
}
export function getDiscoveryReferenceRange(
  filters: DiscoveryFilters,
  range: DateRange | undefined,
  candidate: DateRange,
): DateRange | undefined {
  if (!range || filters.dateRangeId === 'all' || !filters.dateFlexibilityDays)
    return range;
  const flexibility = Math.min(
    7,
    Math.max(0, Math.trunc(filters.dateFlexibilityDays)),
  );
  const shifts = [
    0,
    ...Array.from({ length: flexibility }, (_, index) => [
      -(index + 1),
      index + 1,
    ]).flat(),
  ];
  let best = range;
  let bestNights = sharedNights(candidate, range);
  for (const shift of shifts) {
    const shifted = {
      startDate: new Date(
        Date.parse(range.startDate + 'T00:00:00Z') + shift * 86400000,
      )
        .toISOString()
        .slice(0, 10),
      endDate: new Date(
        Date.parse(range.endDate + 'T00:00:00Z') + shift * 86400000,
      )
        .toISOString()
        .slice(0, 10),
    };
    const nights = sharedNights(candidate, shifted);
    if (nights > bestNights) {
      best = shifted;
      bestNights = nights;
    }
  }
  return best;
}
export function resolveDiscoveryRange(
  filters: DiscoveryFilters,
): DateRange | undefined {
  return filters.dateRangeId !== 'all' &&
    !getDiscoveryDateRangeError(filters.customDateRange)
    ? filters.customDateRange
    : undefined;
}
export function formatTripDates(trip: DateRange): string {
  const format = (date: string) =>
    new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(date + 'T00:00:00Z'));
  return (
    format(trip.startDate) +
    (trip.startDate.slice(0, 4) !== trip.endDate.slice(0, 4)
      ? ' ' + trip.startDate.slice(0, 4)
      : '') +
    ' – ' +
    format(trip.endDate) +
    ' ' +
    trip.endDate.slice(0, 4)
  );
}
