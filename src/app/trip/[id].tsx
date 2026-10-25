import { useCallback } from 'react';
import { DataStatus } from '@/components/ui/data-status';
import { CompatibilityBadge } from '@/components/ui/compatibility-badge';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
import { TripMapCard } from '@/components/trips/trip-map-card';
import { AVAILABLE_PROPOSALS } from '@/data/proposals';
import {
  formatTripDates,
  getMatchFacts,
  getTripLocation,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { getPreferredChildAges } from '@/features/profile/profile-data';
import { TripContactAction } from '@/features/messaging/trip-contact-action';
import { AnimalInformation } from '@/features/animals/animal-ui';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TripReportAction } from '@/features/moderation/trip-report-action';

export function generateStaticParams() {
  return AVAILABLE_PROPOSALS.map(({ trip }) => ({ id: trip.id }));
}

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { filters, proposals: availableProposals, compatibility, status, error, refresh, hasLoaded } = useDiscovery();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const { profile } = useProfile();
  const theme = useTheme();
  const proposal = availableProposals.find((item) => item.trip.id === id);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/explore');
  if (!hasLoaded || (!proposal && status !== 'ready')) return (
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
  const facts = getMatchFacts(
    proposal,
    profile.group,
    [],
    undefined,
    getPreferredChildAges(profile, filters.childAgeBands),
  );
  const score = compatibility[trip.id]?.score;
  return (
    <Screen>
      <HeaderRow>
        <IconButton icon="back" label="Wróć do listy wyjazdów" onPress={back} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          Wyjazd
        </AppText>
        <DemoBadge />
      </HeaderRow>
      <DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Odświeżanie wyjazdu" />
      <View style={styles.illustration}>
        <Landscape kind={trip.landscape} />
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
      </View>
      <TripMapCard trip={trip} />
      <Card>
        <SectionTitle title="Pomysł na wspólny czas" />
        <AppText color="textSecondary">{trip.description}</AppText>
        <View style={layout.wrap}>
          {trip.interests.map((interest) => (
            <Chip key={interest} label={interest} />
          ))}
        </View>
      </Card>
      <Card>
        <AnimalInformation animals={trip.animals} />
      </Card>
      <Card
        style={{
          backgroundColor: theme.positiveBackground,
        }}
      >
        {score !== undefined ? <CompatibilityBadge score={score} /> : (
          <AppText variant="heading" accessibilityRole="header" color="positive">Co Cię łączy z tą ekipą?</AppText>
        )}
        <AppText variant="caption" color="textSecondary">Wynik uwzględnia dostępne dane planów i preferencji.</AppText>
        <View style={layout.wrap}>
          {compatibility[trip.id]?.reasons.map(reason => <Chip key={reason} label={reason} />)}
        </View>
        <AppText variant="label">
          {facts.matchingAgeBands.length
            ? 'Podobny wiek dzieci: ' +
              facts.matchingAgeBands.join(', ') +
              ' lat'
            : group.childAgeBands.length
              ? 'Inne przedziały wieku dzieci niż w Twoich preferencjach.'
              : 'Grupa podróżuje bez dzieci.'}
        </AppText>
        <AppText variant="label">
          {facts.commonInterests.length
            ? 'Wspólne zainteresowania: ' +
              facts.commonInterests.join(', ') +
              '.'
            : 'Warto porozmawiać o wspólnych zainteresowaniach.'}
        </AppText>
      </Card>
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
});
