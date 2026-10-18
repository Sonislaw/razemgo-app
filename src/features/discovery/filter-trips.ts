import type {
  ChildAgeBand,
  DateRange,
  DemoDateRange,
  DiscoveryFilters,
  TripPlan,
  TripProposal,
  TravelGroup,
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
  const range =
    dateRange ??
    (filters.dateRangeId === 'own-trip' ? filters.customDateRange : undefined);
  return proposals.filter(({ trip, group }) => {
    const reference = getDiscoveryReferenceRange(filters, range, trip);
    if (reference && sharedNights(trip, reference) <= 0) return false;
    if (filters.groupKinds?.length && !filters.groupKinds.includes(group.kind))
      return false;
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
export function getDiscoveryReferenceRange(
  filters: DiscoveryFilters,
  range: DateRange | undefined,
  candidate: DateRange,
): DateRange | undefined {
  if (
    !range ||
    filters.dateRangeId !== 'own-trip' ||
    !filters.dateFlexibilityDays
  )
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
  ranges: DemoDateRange[],
): DateRange | undefined {
  return filters.dateRangeId === 'own-trip'
    ? filters.customDateRange
    : ranges.find((range) => range.id === filters.dateRangeId);
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

export interface MatchFacts {
  nights: number | null;
  referenceRange?: DateRange;
  dateSource: 'selected' | 'own-plans' | 'none';
  ageBands: ChildAgeBand[];
  matchingAgeBands: ChildAgeBand[];
  commonInterests: string[];
}

export function getMatchFacts(
  proposal: TripProposal,
  ownGroup: TravelGroup,
  ownPlans: TripPlan[],
  selectedRange?: DateRange,
  preferredAges: ChildAgeBand[] = ownGroup.childAgeBands,
): MatchFacts {
  // Compare actual stays; don't add disjoint plans together or use home locations.
  const referenceRange =
    selectedRange ??
    ownPlans.reduce<TripPlan | undefined>(
      (best, plan) =>
        !best ||
        sharedNights(proposal.trip, plan) > sharedNights(proposal.trip, best)
          ? plan
          : best,
      undefined,
    );
  return {
    nights: referenceRange ? sharedNights(proposal.trip, referenceRange) : null,
    referenceRange,
    dateSource: selectedRange
      ? 'selected'
      : referenceRange
        ? 'own-plans'
        : 'none',
    ageBands: proposal.group.childAgeBands,
    matchingAgeBands: proposal.group.childAgeBands.filter((band) =>
      preferredAges.includes(band),
    ),
    commonInterests: proposal.trip.interests.filter((interest) =>
      ownGroup.interests.includes(interest),
    ),
  };
}

export function formatSharedNights(nights: number): string {
  if (nights === 0) return 'Brak wspólnych nocy';
  if (nights === 1) return '1 wspólna noc';
  const lastDigit = nights % 10;
  const lastTwoDigits = nights % 100;
  if (
    lastDigit >= 2 &&
    lastDigit <= 4 &&
    (lastTwoDigits < 12 || lastTwoDigits > 14)
  )
    return nights + ' wspólne noce';
  return nights + ' wspólnych nocy';
}
