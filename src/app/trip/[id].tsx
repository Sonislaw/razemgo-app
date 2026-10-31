import { TripParticipantsCard } from '@/components/trips/trip-participants-card';
import { DataStatus } from '@/components/ui/data-status';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscoveryTrip } from '@/features/discovery/use-trip-search';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  DemoBadge,
  EmptyState,
  HeaderRow,
  IconButton,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { TripCover } from '@/components/trips/trip-cover';
import { TripMapCard } from '@/components/trips/trip-map-card';
import { TripLocationSummary } from '@/components/trips/trip-location-summary';
import { AVAILABLE_PROPOSALS } from '@/data/proposals';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { TripContactAction } from '@/features/messaging/trip-contact-action';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TripReportAction } from '@/features/moderation/trip-report-action';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';

export function generateStaticParams() {
  return AVAILABLE_PROPOSALS.map(({ trip }) => ({ id: trip.id }));
}

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { item: proposal, status, error, refresh } = useDiscoveryTrip(id);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/explore');
  if (!proposal && status !== 'ready') return (
    <Screen><DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Wczytywanie wyjazdu" /></Screen>
  );
  if (!proposal)
    return (
      <Screen>
        <EmptyState
          title="Nie znaleźliśmy tego wyjazdu"
          description="Ten wyjazd nie jest dostępny. Wróć do listy propozycji."
          action={
            <Button
              label="Przejdź do Odkrywaj"
              onPress={() => router.replace('/explore')}
            />
          }
        />
      </Screen>
    );
  const { trip, group } = proposal;
  return (
    <Screen>
      <HeaderRow>
        <IconButton icon="back" label="Wróć do listy wyjazdów" onPress={back} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          Wyjazd
        </AppText>
        <DemoBadge />
      </HeaderRow>
      <FavoritesNotice />
      <DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Odświeżanie wyjazdu" />
      <TripCover trip={trip} variant="details" datesLabel={formatTripDates(trip)} action={<FavoriteButton kind="trip" targetId={trip.id} compact translucent />} />
      <View style={layout.stack}>
        <TripLocationSummary trip={trip} />
        <Card>
          <SectionTitle title="Pomysł na wspólny czas" />
          <AppText color="textSecondary">{trip.description}</AppText>
          <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} compact />
          {trip.interests.length ? <View style={layout.wrap}>
            {trip.interests.map((interest) => (
              <Chip key={interest} label={interest} />
            ))}
          </View> : null}
        </Card>
      </View>
      <TripMapCard trip={trip} />
      <TripParticipantsCard value={trip.participants} animals={trip.animals} />
      <Card>
        <View style={layout.row}>
          <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={48} />
          <View style={styles.organizerDetails}>
            <AppText variant="caption" color="textSecondary">
              Organizator wyjazdu
            </AppText>
            <AppText variant="heading" accessibilityRole="header" numberOfLines={2} style={styles.organizerName}>
              {group.name}
            </AppText>
          </View>
          <TravelModeBadges modes={trip.travelModes ?? group.travelModes} />
        </View>
        <Button label="Zobacz profil ekipy" variant="secondary" onPress={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })} />
      </Card>
      <TripContactAction proposal={proposal} />
      <TripReportAction key={trip.id} tripId={trip.id} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  organizerDetails: { flex: 1, minWidth: 0, gap: 4 },
  organizerName: { fontSize: 16, lineHeight: 22 },
});
