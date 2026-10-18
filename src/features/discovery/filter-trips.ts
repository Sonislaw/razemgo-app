import type {
  DateRange,
  DiscoveryFilters,
  TripPlan,
  TripProposal,
} from '../../types/travel';

export const INITIAL_FILTERS: DiscoveryFilters = {
  mode: 'planned',
  dateRangeId: 'all',
  location: '',
  childAgeBands: [],
};
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
  return place.name + ', ' + place.region;
}
export function filterProposals(
  proposals: TripProposal[],
  filters: DiscoveryFilters,
  dateRange?: DateRange,
): TripProposal[] {
  const location = normalizeLocation(filters.location);
  return proposals.filter(({ trip, group }) => {
    if (dateRange && sharedNights(trip, dateRange) <= 0) return false;
    if (
      location &&
      !normalizeLocation(getTripLocation(trip)).includes(location)
    )
      return false;
    if (
      filters.childAgeBands.length &&
      !group.childAgeBands.some((band) => filters.childAgeBands.includes(band))
    )
      return false;
    return true;
  });
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
    ' – ' +
    format(trip.endDate) +
    ' ' +
    trip.startDate.slice(0, 4)
  );
}
