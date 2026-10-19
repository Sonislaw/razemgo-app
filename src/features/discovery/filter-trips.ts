import type {
  ChildAgeBand,
  DateRange,
  DiscoveryFilters,
  TripPlan,
  TripMode,
  TripProposal,
  TravelGroup,
} from '../../types/travel';
import type { OwnedTrip } from '../../types/owned-trip';
import type { TravelerProfile } from '../../types/profile';
import { isValidDate } from '../trips/own-trips-state.ts';

export const INITIAL_FILTERS: DiscoveryFilters = {
  tripModes: ['planned', 'flexible'],
  dateRangeId: 'all',
  location: '',
  childAgeBands: [],
  animalKinds: [],
};
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
export function updateDiscoveryDate(
  filters: DiscoveryFilters,
  field: keyof DateRange,
  value: string,
): DiscoveryFilters {
  const range = {
    startDate: filters.customDateRange?.startDate ?? '',
    endDate: filters.customDateRange?.endDate ?? '',
    [field]: value,
  };
  return {
    ...filters,
    dateRangeId: 'custom',
    customDateRange: range,
    dateFlexibilityDays: 0,
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
  return place.name + ', ' + place.region;
}
export function filterProposals(
  proposals: TripProposal[],
  filters: DiscoveryFilters,
  dateRange?: DateRange,
): TripProposal[] {
  const location = normalizeLocation(filters.location);
  if (
    filters.dateRangeId !== 'all' &&
    getDiscoveryDateRangeError(filters.customDateRange)
  )
    return [];
  const range = dateRange ?? resolveDiscoveryRange(filters);
  const matching = proposals.filter(({ trip, group }) => {
    if (!filters.tripModes.includes(trip.mode)) return false;
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

export interface HomeRecommendation {
  proposal: TripProposal;
  source: 'trip' | 'interests' | 'inspiration';
  ownTripId?: string;
  nights: number;
  dateShifted: boolean;
  commonInterests: string[];
  matchingAges: ChildAgeBand[];
}
/** Local demo suggestions, with observable reasons rather than a compatibility percentage. */
export function selectHomeRecommendations(
  proposals: TripProposal[],
  profile: TravelerProfile,
  ownTrips: OwnedTrip[],
  today: string,
  blockedGroupIds: string[] = [],
): HomeRecommendation[] {
  const candidates = proposals.filter(
    ({ trip, group }) =>
      group.id !== profile.group.id &&
      !blockedGroupIds.includes(group.id) &&
      Number.isFinite(Date.parse(trip.startDate)) &&
      Number.isFinite(Date.parse(trip.endDate)) &&
      trip.startDate < trip.endDate &&
      trip.endDate > today,
  );
  const searchableTrips = ownTrips
    .filter(
      (trip) =>
        trip.status === 'published' &&
        trip.visibility === 'public' &&
        Number.isFinite(Date.parse(trip.startDate)) &&
        Number.isFinite(Date.parse(trip.endDate)) &&
        trip.endDate > today &&
        trip.startDate < trip.endDate,
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
    );
  const tailored: HomeRecommendation[] = [];
  for (const proposal of candidates) {
    for (const ownTrip of searchableTrips) {
      const place =
        ownTrip.mode === 'planned' ? ownTrip.destination : ownTrip.travelArea;
      const filters: DiscoveryFilters = {
        tripModes: ['planned', 'flexible'],
        dateRangeId: 'own-trip',
        customDateRange: {
          startDate: ownTrip.startDate,
          endDate: ownTrip.endDate,
        },
        dateFlexibilityDays:
          ownTrip.mode === 'flexible' ? ownTrip.dateFlexibilityDays : 0,
        location: place.region,
        childAgeBands: ownTrip.matching.childAgeBands,
        groupKinds: ownTrip.matching.groupKinds,
      };
      if (!filterProposals([proposal], filters).length) continue;
      const reference = getDiscoveryReferenceRange(
        filters,
        ownTrip,
        proposal.trip,
      )!;
      const interests = ownTrip.interests.length
        ? ownTrip.interests
        : profile.group.interests;
      tailored.push({
        proposal,
        source: 'trip',
        ownTripId: ownTrip.id,
        nights: sharedNights(proposal.trip, reference),
        dateShifted: reference.startDate !== ownTrip.startDate,
        commonInterests: proposal.trip.interests.filter((interest) =>
          interests.includes(interest),
        ),
        matchingAges: proposal.group.childAgeBands.filter((age) =>
          ownTrip.matching.childAgeBands.includes(age),
        ),
      });
      break;
    }
  }
  const compare = (a: HomeRecommendation, b: HomeRecommendation) =>
    b.commonInterests.length - a.commonInterests.length ||
    b.nights - a.nights ||
    b.matchingAges.length - a.matchingAges.length ||
    a.proposal.trip.startDate.localeCompare(b.proposal.trip.startDate) ||
    a.proposal.trip.id.localeCompare(b.proposal.trip.id);
  const unique = (items: HomeRecommendation[]) => {
    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.proposal.group.id)) return false;
        seen.add(item.proposal.group.id);
        return true;
      })
      .slice(0, 3);
  };
  if (tailored.length) return unique(tailored.sort(compare));
  const preferredAges = profile.matching.childAgeBands.length
    ? profile.matching.childAgeBands
    : profile.group.childAgeBands;
  const fromProfile = candidates
    .filter(
      ({ group, trip }) =>
        (!profile.matching.groupKinds.length ||
          profile.matching.groupKinds.includes(group.kind)) &&
        (!preferredAges.length ||
          group.childAgeBands.some((age) => preferredAges.includes(age))) &&
        trip.interests.some((interest) =>
          profile.group.interests.includes(interest),
        ),
    )
    .map((proposal) => ({
      proposal,
      source: 'interests' as const,
      nights: 0,
      dateShifted: false,
      commonInterests: proposal.trip.interests.filter((interest) =>
        profile.group.interests.includes(interest),
      ),
      matchingAges: proposal.group.childAgeBands.filter((age) =>
        preferredAges.includes(age),
      ),
      ownTripId: searchableTrips[0]?.id,
    }));
  if (fromProfile.length) return unique(fromProfile.sort(compare));
  return unique(
    candidates
      .map((proposal) => ({
        proposal,
        source: 'inspiration' as const,
        nights: 0,
        dateShifted: false,
        commonInterests: [],
        matchingAges: [],
        ownTripId: searchableTrips[0]?.id,
      }))
      .sort(compare),
  );
}
