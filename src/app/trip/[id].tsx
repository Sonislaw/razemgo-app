import { DataStatus } from '@/components/ui/data-status';
import { RecommendationDetails } from '@/components/ui/recommendation';
import { getTripHeadline } from '@/features/trips/trip-headline';
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
import { Landscape } from '@/components/trips/landscape';
import { TripPlanningIcon } from '@/components/trips/trip-planning-icon';
import { TripTimeline } from '@/components/trips/trip-timeline';
import { TripMapCard } from '@/components/trips/trip-map-card';
import { AVAILABLE_PROPOSALS } from '@/data/proposals';
import {
  formatTripDates,
  getTripLocation,
  INITIAL_FILTERS,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TripContactAction } from '@/features/messaging/trip-contact-action';
import { AnimalInformation } from '@/features/animals/animal-ui';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TripReportAction } from '@/features/moderation/trip-report-action';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';

export function generateStaticParams() {
  return AVAILABLE_PROPOSALS.map(({ trip }) => ({ id: trip.id }));
}

export default function TripDetailsScreen() {
  const { id, recommendationScope } = useLocalSearchParams<{ id: string; recommendationScope?: string }>();
  const { filters } = useDiscovery();
  const { item: proposal, status, error, refresh } = useDiscoveryTrip(id, recommendationScope === 'search' ? filters : INITIAL_FILTERS);
  const theme = useTheme();
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
  const recommendedInterests = new Set(proposal.recommendation?.reasons.filter(reason => reason.code === 'interest').map(reason => reason.value));
  const remainingInterests = trip.interests.filter(interest => !recommendedInterests.has(interest));
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
      <View style={styles.illustration}>
        <Landscape kind={trip.landscape} />
        <View style={styles.favoriteAction}>
          <FavoriteButton kind="trip" targetId={trip.id} compact translucent />
        </View>
      </View>
      <View style={layout.stack}>
        <AppText variant="caption" color="primaryStrong">
          {trip.mode === 'planned'
            ? 'MAM PLAN'
            : 'SZUKAM POMYSŁU · CEL DO USTALENIA'}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {getTripHeadline(trip)}
        </AppText>
        <View style={layout.row}>
          <TripPlanningIcon kind={trip.mode} size={24} framed={false} />
          <AppText style={styles.flex}>{getTripLocation(trip)}</AppText>
        </View>
        {trip.mode === 'planned' && trip.campgroundName ? (
          <AppText>Kemping: {trip.campgroundName}</AppText>
        ) : null}
        {trip.mode === 'planned' && trip.campgroundAddress ? (
          <AppText>{trip.campgroundAddress}</AppText>
        ) : null}
        <View style={layout.row}>
          <TripPlanningIcon kind="dates" size={24} framed={false} />
          <AppText style={styles.flex}>{formatTripDates(trip)}</AppText>
        </View>
        <TripTimeline trip={trip} />
      </View>
      <TripMapCard trip={trip} />
      <Card>
        <SectionTitle title="Pomysł na wspólny czas" />
        <AppText color="textSecondary">{trip.description}</AppText>
        <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} compact />
        {remainingInterests.length ? <View style={layout.wrap}>
          {remainingInterests.map((interest) => (
            <Chip key={interest} label={interest} />
          ))}
        </View> : null}
      </Card>
      <Card>
        <AnimalInformation animals={trip.animals} />
      </Card>
      {proposal.recommendation ? <Card style={{ backgroundColor: theme.positiveBackground }}>
        <RecommendationDetails recommendation={proposal.recommendation} kind="trip" />
      </Card> : null}
      <Card>
        <View style={layout.row}>
          <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={56} />
          <View style={[styles.flex, { gap: 4 }]}>
            <AppText variant="caption" color="textSecondary">
              Organizator wyjazdu
            </AppText>
            <AppText variant="heading" accessibilityRole="header">
              {group.name}
            </AppText>
          </View>
        </View>
        <AppText>
          {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          {group.childAgeBands.length
            ? ' · dzieci: ' + group.childAgeBands.join(', ') + ' lat'
            : ' · bez dzieci'}
        </AppText>
        <TravelModeBadges modes={trip.travelModes ?? group.travelModes} />
        <Button label="Zobacz profil ekipy" variant="secondary" onPress={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })} />
      </Card>
      <TripContactAction proposal={proposal} />
      <TripReportAction key={trip.id} tripId={trip.id} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  illustration: { borderRadius: Radius.card, overflow: 'hidden' },
  favoriteAction: { position: 'absolute', top: 8, right: 8 },
});
