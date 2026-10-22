import type { OwnedTrip } from '../../types/owned-trip';
import type { TripPlan, TripProposal } from '../../types/travel';
import { isSearchingTrip, isValidDate } from '../trips/own-trips-state.ts';

export interface HomeListing {
  trip: TripPlan;
  own: boolean;
}

export function selectLatestListing(
  proposals: TripProposal[],
  ownTrips: OwnedTrip[],
  ownGroupId: string,
  today: string,
  blockedGroupIds: string[] = [],
): HomeListing | undefined {
  const candidates: HomeListing[] = [
    ...proposals
      .filter(({ trip }) => trip.groupId !== ownGroupId)
      .map(({ trip }) => ({ trip, own: false })),
    ...ownTrips
      .filter((trip) => isSearchingTrip(trip, today))
      .map((trip) => ({ trip, own: true })),
  ];
  const publicationTime = ({ trip }: HomeListing) => {
    const time = Date.parse(trip.publishedAt ?? '');
    return Number.isFinite(time) ? time : 0;
  };
  return candidates
    .filter(
      ({ trip }) =>
        !blockedGroupIds.includes(trip.groupId) &&
        isValidDate(trip.startDate) &&
        isValidDate(trip.endDate) &&
        trip.endDate > trip.startDate &&
        trip.endDate > today,
    )
    .sort(
      (a, b) =>
        publicationTime(b) - publicationTime(a) ||
        a.trip.id.localeCompare(b.trip.id),
    )[0];
}
