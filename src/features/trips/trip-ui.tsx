import { getTripHeadline } from '@/features/trips/trip-headline';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  AppText,
  Button,
  HeaderRow,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { TripListingAction, TripListingCard } from '@/components/trips/trip-listing-card';
import { IS_DEMO_MODE } from '@/constants/app';
import { useTheme } from '@/hooks/use-theme';
import type { OwnedTrip, TripStatus } from '@/types/owned-trip';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useAccountAccess } from '@/features/moderation/account-access-context';
import {
  discoveryFiltersForTrip,
  getTripStatus,
  isSearchingTrip,
  isValidDate,
  todayDate,
  TRIP_STATUS_LABELS,
} from './own-trips-state';

export function ownTripPlace(trip: OwnedTrip): string {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  return (
    [place.name, place.region].filter(Boolean).join(', ') ||
    'Miejsce do uzupełnienia'
  );
}
export function ownTripDates(trip: OwnedTrip): string {
  return isValidDate(trip.startDate) &&
    isValidDate(trip.endDate) &&
    trip.endDate > trip.startDate
    ? formatTripDates(trip)
    : 'Termin do uzupełnienia';
}
export function TripStatusBadge({ status }: { status: TripStatus }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor:
          status === 'published'
            ? theme.positiveBackground
            : status === 'draft'
              ? theme.hero
              : theme.muted,
      }}
    >
      <AppText
        variant="caption"
        color={status === 'published' ? 'positive' : 'textSecondary'}
      >
        {TRIP_STATUS_LABELS[status]}
      </AppText>
    </View>
  );
}
export function TripPageHeader({
  title,
  onBack,
  onMenu,
}: {
  title: string;
  onBack: () => void;
  onMenu?: () => void;
}) {
  return (
    <HeaderRow>
      <IconButton label="Wróć do wyjazdów" icon="back" onPress={onBack} />
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
      {onMenu ? (
        <IconButton label="Opcje wyjazdu" icon="more" onPress={onMenu} />
      ) : null}
    </HeaderRow>
  );
}
export function TripDemoNote() {
  return IS_DEMO_MODE ? (
    <AppText variant="caption" color="textSecondary">
      Dane demonstracyjne · zmiany tylko w tej sesji.
    </AppText>
  ) : null;
}
export function OwnTripCard({ trip, onMenu }: {
  trip: OwnedTrip;
  onMenu: () => void;
}) {
  const { setFilters } = useDiscovery();
  const { hidden_trip_ids } = useAccountAccess();
  const hidden = hidden_trip_ids.includes(trip.id);
  const searching = !hidden && isSearchingTrip(trip, todayDate());
  return (
    <TripListingCard
      testID={'own-trip-' + trip.id}
      trip={trip}
      locationLabel={ownTripPlace(trip)}
      datesLabel={ownTripDates(trip)}
      rightBadge={<TripStatusBadge status={getTripStatus(trip, todayDate())} />}
      footer={
        <View style={{ gap: 8 }}>
          {hidden ? <AppText variant="caption" color="textSecondary">Ogłoszenie ukryte przez moderację. Zmiana treści nie przywróci jego widoczności.</AppText> : null}
          <View style={[layout.row, { justifyContent: 'space-between' }]}>
            <IconButton
              label={'Opcje wyjazdu: ' + getTripHeadline(trip)}
              icon="more"
              onPress={onMenu}
            />
            {trip.visibility === 'private' ? (
              <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>Prywatny plan</AppText>
            ) : null}
            <TripListingAction
              label="Szczegóły"
              accessibilityLabel={'Szczegóły wyjazdu: ' + getTripHeadline(trip)}
              onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
            />
          </View>
          <Button
            label="Znajdź towarzystwo"
            icon="people"
            disabled={!searching}
            onPress={() => {
              setFilters(discoveryFiltersForTrip(trip));
              router.navigate('/explore');
            }}
          />
        </View>
      }
    />
  );
}
