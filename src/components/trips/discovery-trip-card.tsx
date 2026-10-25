import { router } from 'expo-router';
import type { MatchFacts } from '@/features/discovery/filter-trips';
import type { TripProposal } from '@/types/travel';
import { TripListingAction, TripListingCard } from './trip-listing-card';

interface DiscoveryTripCardProps extends TripProposal {
  facts: Pick<MatchFacts, 'ageBands' | 'matchingAgeBands'>;
  score?: number;
}

export function DiscoveryTripCard({ trip, group, facts, score }: DiscoveryTripCardProps) {
  return (
    <TripListingCard
      testID={'discovery-trip-' + trip.id}
      trip={trip}
      group={group}
      onPressGroup={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })}
      travelModes={trip.travelModes}
      ageBands={facts.matchingAgeBands.length ? facts.matchingAgeBands : facts.ageBands}
      score={score}
      footer={
        <TripListingAction
          label="Zobacz wyjazd"
          onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
        />
      }
    />
  );
}
