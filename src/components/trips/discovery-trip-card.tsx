import { router } from 'expo-router';
import { memo } from 'react';
import type { TripProposal } from '@/types/travel';
import { TripListingAction, TripListingCard } from './trip-listing-card';
import { CardShareActions } from '@/features/sharing/card-share-actions';
import { View } from 'react-native';
import { TripReactionsButton, TripReactionsPreview } from '@/features/reactions/trip-reactions';

interface DiscoveryTripCardProps extends TripProposal {
  onNavigate?: () => void;
  preview?: boolean;
  testID?: string;
  locationLabel?: string;
  datesLabel?: string;
}

export const DiscoveryTripCard = memo(function DiscoveryTripCard({ trip, group, onNavigate, preview = false, testID, locationLabel, datesLabel }: DiscoveryTripCardProps) {
  const openTrip = () => {
    onNavigate?.();
    router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
  };
  return (
    <TripListingCard
      testID={testID ?? 'discovery-trip-' + trip.id}
      trip={trip}
      group={group}
      showCrewParticipants={false}
      disabled={preview}
      onPressDetails={preview ? undefined : openTrip}
      locationLabel={locationLabel}
      datesLabel={datesLabel}
      onPressGroup={() => { onNavigate?.(); router.push({ pathname: '/crew/[id]', params: { id: group.id } }); }}
      travelModes={trip.travelModes}
      favoriteAction={<CardShareActions kind="trip" targetId={trip.id} preview={preview} />}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        {preview ? <TripReactionsPreview /> : <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} />}
        <TripListingAction
          label="Zobacz wyjazd"
          onPress={preview ? undefined : openTrip}
        />
        </View>
      }
    />
  );
});
