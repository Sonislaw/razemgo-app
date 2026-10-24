import { AppText } from '@/components/ui/primitives';
import type { DateRange, TravelGroup, TripPlan } from '@/types/travel';
import { TripListingCard } from './trip-listing-card';

export interface TripCardProps {
  trip: TripPlan;
  group: TravelGroup;
  compact?: boolean;
  dateRange?: DateRange;
}

export function TripCard({ trip, group, compact = false }: TripCardProps) {
  return (
    <TripListingCard trip={trip} group={group}>
      {!compact ? <AppText color="textSecondary">{trip.description}</AppText> : null}
    </TripListingCard>
  );
}
