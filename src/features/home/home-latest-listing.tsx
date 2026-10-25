import { TripListingAction, TripListingCard } from '@/components/trips/trip-listing-card';
import { formatTripDates, getTripLocation } from '@/features/discovery/filter-trips';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import type { TravelGroup, TripPlan } from '@/types/travel';
import { View } from 'react-native';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';

export function HomeLatestListing({ trip, group, travelModes, score, isOwn, onPress }: {
  trip: TripPlan;
  group?: TravelGroup;
  travelModes?: string[];
  score?: number;
  isOwn: boolean;
  onPress: () => void;
}) {
  return (
    <TripListingCard
      testID="home-latest-listing"
      trip={trip}
      group={group}
      travelModes={travelModes}
      score={score}
      favoriteAction={!isOwn ? <FavoriteButton kind="trip" targetId={trip.id} compact translucent /> : undefined}
      accessibilityLabel={'Ostatnio dodane ogłoszenie: ' + getTripHeadline(trip)}
      accessibilityHint={getTripLocation(trip) + ', ' + formatTripDates(trip) + '. Otwórz szczegóły wyjazdu.'}
      onPress={onPress}
      footer={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} />
        <TripListingAction label="Zobacz wyjazd" onPress={onPress} />
      </View>}
    />
  );
}
