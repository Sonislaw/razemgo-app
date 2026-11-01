import { router } from 'expo-router';
import type { TripProposal } from '@/types/travel';
import { TripListingAction, TripListingCard } from './trip-listing-card';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import { FavoriteIconButton } from '@/features/favorites/favorite-icon-button';
import { View } from 'react-native';
import { TripReactionsButton, TripReactionsPreview } from '@/features/reactions/trip-reactions';

interface DiscoveryTripCardProps extends TripProposal {
  onNavigate?: () => void;
  preview?: boolean;
  testID?: string;
  locationLabel?: string;
  datesLabel?: string;
}

export function DiscoveryTripCard({ trip, group, onNavigate, preview = false, testID, locationLabel, datesLabel }: DiscoveryTripCardProps) {
  return (
    <TripListingCard
      testID={testID ?? 'discovery-trip-' + trip.id}
      trip={trip}
      group={group}
      disabled={preview}
      locationLabel={locationLabel}
      datesLabel={datesLabel}
      onPressGroup={() => { onNavigate?.(); router.push({ pathname: '/crew/[id]', params: { id: group.id } }); }}
      travelModes={trip.travelModes}
      favoriteAction={preview
        ? <FavoriteIconButton label="Dodaj wyjazd do ulubionych" compact translucent disabled onPress={() => {}} />
        : <FavoriteButton kind="trip" targetId={trip.id} compact translucent />}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        {preview ? <TripReactionsPreview /> : <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} />}
        <TripListingAction
          label="Zobacz wyjazd"
          onPress={preview ? undefined : () => { onNavigate?.(); router.push({ pathname: '/trip/[id]', params: {
            id: trip.id,
          } }); }}
        />
        </View>
      }
    />
  );
}
