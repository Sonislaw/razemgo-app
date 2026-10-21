import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useLocalSearchParams } from 'expo-router';
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
import { Icon } from '@/components/ui/icon';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { DEMO_COMPATIBILITY_SCORES } from '@/data/mocks/compatibility';
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

export function generateStaticParams() {
  return DEMO_PROPOSALS.map(({ trip }) => ({ id: trip.id }));
}

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { filters } = useDiscovery();
  const { profile } = useProfile();
  const theme = useTheme();
  const proposal = DEMO_PROPOSALS.find((item) => item.trip.id === id);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/explore');
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
  const score = DEMO_COMPATIBILITY_SCORES[trip.id];
  return (
    <Screen>
      <HeaderRow style={{ flexWrap: 'wrap' }}>
        <IconButton icon="back" label="Wróć do listy wyjazdów" onPress={back} />
        <AppText variant="label" style={styles.flex}>
          Wyjazd
        </AppText>
        <DemoBadge />
      </HeaderRow>
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
          <Icon name="pin" />
          <AppText style={styles.flex}>{getTripLocation(trip)}</AppText>
        </View>
        {trip.mode === 'planned' && trip.campgroundName ? (
          <AppText>Kemping: {trip.campgroundName}</AppText>
        ) : null}
        <View style={layout.row}>
          <Icon name="calendar" />
          <AppText style={styles.flex}>{formatTripDates(trip)}</AppText>
        </View>
      </View>
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
        <AppText variant="heading" accessibilityRole="header" color="positive">
          {score !== undefined ? score + '% zgodności' : 'Co Cię łączy z tą ekipą?'}
        </AppText>
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
        <SectionTitle title={group.name} />
        <AppText>
          {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          {group.childAgeBands.length
            ? ' · dzieci: ' + group.childAgeBands.join(', ') + ' lat'
            : ' · bez dzieci'}
        </AppText>
        <AppText color="textSecondary">{group.travelModes.join(', ')}</AppText>
      </Card>
      <TripContactAction proposal={proposal} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  illustration: { borderRadius: Radius.card, overflow: 'hidden' },
});
