import { router } from 'expo-router';
import type { MatchFacts } from '@/features/discovery/filter-trips';
import type { TripProposal } from '@/types/travel';
import { TripListingAction, TripListingCard } from './trip-listing-card';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import { View } from 'react-native';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';

interface DiscoveryTripCardProps extends TripProposal {
  facts: Pick<MatchFacts, 'ageBands' | 'matchingAgeBands'>;
  score?: number;
  onNavigate?: () => void;
}

export function DiscoveryTripCard({ trip, group, facts, score, onNavigate }: DiscoveryTripCardProps) {
  return (
    <TripListingCard
      testID={'discovery-trip-' + trip.id}
      trip={trip}
      group={group}
      onPressGroup={() => { onNavigate?.(); router.push({ pathname: '/crew/[id]', params: { id: group.id } }); }}
      travelModes={trip.travelModes}
      ageBands={facts.matchingAgeBands.length ? facts.matchingAgeBands : facts.ageBands}
      score={score}
      favoriteAction={<FavoriteButton kind="trip" targetId={trip.id} compact translucent />}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} />
        <TripListingAction
          label="Zobacz wyjazd"
          onPress={() => { onNavigate?.(); router.push({ pathname: '/trip/[id]', params: { id: trip.id } }); }}
        />
        </View>
      }
    />
  );
}
