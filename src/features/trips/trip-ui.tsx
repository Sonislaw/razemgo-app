import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, IconButton, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { TripThumbnail } from '@/components/trips/trip-thumbnail';
import { CompactTripCard } from '@/components/trips/compact-trip-card';
import { IS_DEMO_MODE } from '@/constants/app';
import { useTheme } from '@/hooks/use-theme';
import type { OwnedTrip, TripStatus } from '@/types/owned-trip';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { TripAnimalTag } from '@/features/animals/animal-ui';
import {
  getTripStatus,
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
        borderRadius: 12,
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
    <View style={layout.row}>
      <IconButton label="Wróć do wyjazdów" icon="back" onPress={onBack} />
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
      {onMenu ? (
        <IconButton label="Opcje wyjazdu" icon="more" onPress={onMenu} />
      ) : null}
    </View>
  );
}
export function TripDemoNote() {
  return IS_DEMO_MODE ? (
    <AppText variant="caption" color="textSecondary">
      Dane demonstracyjne · zmiany tylko w tej sesji.
    </AppText>
  ) : null;
}
export function OwnTripCard({
  trip,
  onMenu,
}: {
  trip: OwnedTrip;
  onMenu: () => void;
}) {
  const theme = useTheme();
  return (
    <CompactTripCard style={{ gap: 4 }}>
      <View style={[layout.row, { justifyContent: 'space-between' }]}>
        <TripStatusBadge status={getTripStatus(trip, todayDate())} />
        <IconButton
          label={'Opcje wyjazdu: ' + trip.title}
          icon="more"
          onPress={onMenu}
        />
      </View>
      <View style={[layout.row, { alignItems: 'flex-start' }]}>
        <TripThumbnail kind={trip.landscape} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText
            accessibilityRole="header"
            variant="label"
            style={{ fontSize: 17, lineHeight: 22 }}
            numberOfLines={2}
          >
            {trip.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {ownTripPlace(trip)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {ownTripDates(trip)}
            {trip.mode === 'flexible' && trip.dateFlexibilityDays
              ? ` · ±${trip.dateFlexibilityDays} ${trip.dateFlexibilityDays === 1 ? 'dzień' : 'dni'}`
              : ''}
          </AppText>
        </View>
      </View>
      <View style={{ paddingTop: 8 }}>
        <TripAnimalTag animals={trip.animals} />
      </View>
      <View
        style={[
          layout.row,
          {
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: theme.border,
            marginTop: 8,
          },
        ]}
      >
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ flex: 1, minWidth: 90 }}
        >
          {trip.mode === 'planned' ? 'Mam plan' : 'Szukam pomysłu'}
          {trip.visibility === 'private' ? ' · prywatny' : ''}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Szczegóły wyjazdu: ' + trip.title}
          onPress={() =>
            router.push({ pathname: '/trips/[id]', params: { id: trip.id } })
          }
          style={[layout.row, { minHeight: 48, paddingHorizontal: 8 }]}
        >
          <AppText variant="label" color="primaryStrong">
            Szczegóły
          </AppText>
          <Icon name="arrow" size={18} />
        </Pressable>
      </View>
    </CompactTripCard>
  );
}
