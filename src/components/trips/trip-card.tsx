import { AppText } from '@/components/ui/primitives';
import type { DateRange, TravelGroup, TripPlan } from '@/types/travel';
import { TripListingCard } from './trip-listing-card';
import { TripListAttribution } from './location-attribution';
import { View } from 'react-native';

export interface TripCardProps {
  trip: TripPlan;
  group: TravelGroup;
  compact?: boolean;
  dateRange?: DateRange;
}

export function TripCard({ trip, group, compact = false }: TripCardProps) {
  return (<View style={{gap:6}}>
    <TripListingCard trip={trip} group={group}>
      {!compact ? <AppText color="textSecondary">{trip.description}</AppText> : null}
    </TripListingCard>
    <TripListAttribution trips={[trip]}/>
    </View>
  );
}
