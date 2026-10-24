import { router } from 'expo-router';
import type { MatchFacts } from '@/features/discovery/filter-trips';
import type { TripProposal } from '@/types/travel';
import { TripListingAction, TripListingCard } from './trip-listing-card';

interface DiscoveryTripCardProps extends TripProposal {
  facts: Pick<MatchFacts, 'ageBands' | 'matchingAgeBands'>;
  demoScore?: number;
}

export function DiscoveryTripCard({ trip, group, facts, demoScore }: DiscoveryTripCardProps) {
  return (
    <TripListingCard
      testID={'discovery-trip-' + trip.id}
      trip={trip}
      group={group}
      ageBands={facts.matchingAgeBands.length ? facts.matchingAgeBands : facts.ageBands}
      score={demoScore}
      footer={
        <TripListingAction
          label="Zobacz wyjazd"
          onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
        />
      }
    />
  );
}
