import { TripListingAction, TripListingCard } from '@/components/trips/trip-listing-card';
import { formatTripDates, getTripLocation } from '@/features/discovery/filter-trips';
import { getTripHeadline } from '@/features/trips/trip-headline';
import type { TravelGroup, TripPlan } from '@/types/travel';

export function HomeLatestListing({ trip, group, travelModes, score, onPress }: {
  trip: TripPlan;
  group?: TravelGroup;
  travelModes?: string[];
  score?: number;
  onPress: () => void;
}) {
  return (
    <TripListingCard
      testID="home-latest-listing"
      trip={trip}
      group={group}
      travelModes={travelModes}
      score={score}
      accessibilityLabel={'Ostatnio dodane ogłoszenie: ' + getTripHeadline(trip)}
      accessibilityHint={getTripLocation(trip) + ', ' + formatTripDates(trip) + '. Otwórz szczegóły wyjazdu.'}
      onPress={onPress}
      footer={<TripListingAction label="Zobacz wyjazd" />}
    />
  );
}
