// Legacy test fixtures only; current discovery performs explicit filtering.
import type { ChildAgeBand, DateRange, DiscoveryFilters, TripPlan, TripProposal, TravelGroup } from '../../../src/types/travel';
import type { OwnedTrip } from '../../../src/types/owned-trip';
import type { TravelerProfile } from '../../../src/types/profile';
import { filterProposals, getDiscoveryReferenceRange, sharedNights } from '../../../src/features/discovery/filter-trips.ts';

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
  // Compare actual stays; don't add disjoint plans together.
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
    ageBands: proposal.trip.participants?.childAgeBands ?? [],
    matchingAgeBands: (proposal.trip.participants?.childAgeBands ?? []).filter((band) =>
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
        dateFlexibilityDays: 0,
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
        matchingAges: (proposal.trip.participants?.childAgeBands ?? []).filter((age) =>
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
  const preferredAges = profile.group.childAgeBands;
  const fromProfile = candidates
    .filter(
      ({ group, trip }) =>
        (!preferredAges.length ||
          (trip.participants?.childAgeBands ?? []).some((age) => preferredAges.includes(age))) &&
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
      matchingAges: (proposal.trip.participants?.childAgeBands ?? []).filter((age) =>
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
