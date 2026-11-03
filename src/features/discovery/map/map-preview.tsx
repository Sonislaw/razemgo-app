import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { formatTripDates } from '../filter-trips';
import { LandscapePhoto } from '@/components/trips/landscape-photo';
import type { MapProposal } from './map-data';

export function MapPreview({
  item,
  onClose,
  onNavigate,
}: {
  item: MapProposal;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const theme = useTheme(),
    { trip, group } = item,
    people = trip.participants;
  return (
    <View
      testID="map-trip-preview"
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={layout.row}>
        <LandscapePhoto kind={trip.landscape} style={styles.image} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <AppText variant="label" numberOfLines={2}>
            {getTripHeadline(trip)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {formatTripDates(trip)}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {trip.destination.name}
          </AppText>
        </View>
        <IconButton
          icon="close"
          label="Zamknij podgląd wyjazdu"
          onPress={onClose}
        />
      </View>
      <View style={layout.row}>
        <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="caption" numberOfLines={1}>
            {group.name}
          </AppText>
          {people ? (
            <AppText variant="caption" color="textSecondary">
              Dorośli: {people.adultCount}
              {people.childCount ? ' · Dzieci: ' + people.childCount : ''}
            </AppText>
          ) : null}
        </View>
        <FavoriteButton kind="trip" targetId={trip.id} compact />
      </View>
      <AppText variant="caption" color="textSecondary">
        Lokalizacja orientacyjna — miejscowość.
      </AppText>
      <Button
        label="Zobacz wyjazd"
        onPress={() => {
          onNavigate();
          router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderRadius: 24,
    boxShadow: '0px 4px 20px rgba(36,56,66,0.16)',
  },
  image: { width: 60, height: 65, borderRadius: 12 },
});
