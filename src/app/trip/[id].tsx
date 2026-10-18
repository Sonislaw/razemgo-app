import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  DemoBadge,
  EmptyState,
  IconButton,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { Landscape } from '@/components/trips/landscape';
import { Icon } from '@/components/ui/icon';
import {
  DEMO_DATE_RANGES,
  DEMO_PROPOSALS,
  MY_TRIPS,
} from '@/data/mocks/travel';
import { DEMO_COMPATIBILITY_SCORES } from '@/data/mocks/compatibility';
import {
  formatSharedNights,
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
          description="Ten przykładowy wyjazd nie jest dostępny. Wróć do listy propozycji."
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
  const selectedRange = DEMO_DATE_RANGES.find(
    (range) => range.id === filters.dateRangeId,
  );
  const facts = getMatchFacts(
    proposal,
    profile.group,
    MY_TRIPS,
    selectedRange,
    getPreferredChildAges(profile, filters.childAgeBands),
  );
  const score = DEMO_COMPATIBILITY_SCORES[trip.id];
  return (
    <Screen>
      <View style={[layout.row, { flexWrap: 'wrap' }]}>
        <IconButton icon="back" label="Wróć do listy wyjazdów" onPress={back} />
        <AppText variant="label" style={styles.flex}>
          Wyjazd
        </AppText>
        <DemoBadge />
      </View>
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
          {trip.title}
        </AppText>
        <View style={layout.row}>
          <Icon name="pin" />
          <AppText style={styles.flex}>{getTripLocation(trip)}</AppText>
        </View>
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
      <Card style={{ backgroundColor: theme.positiveBackground }}>
        <AppText variant="heading" accessibilityRole="header" color="positive">
          {score !== undefined ? score + '% zgodności · demo' : 'Co Was łączy?'}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Przykładowa ocena zgodności. Poniższe terminy, przedziały wieku i
          zainteresowania pochodzą z danych demonstracyjnych.
        </AppText>
        {facts.nights !== null ? (
          <View style={layout.stack}>
            <AppText variant="label" color="positive">
              {formatSharedNights(facts.nights)}
            </AppText>
            {facts.referenceRange ? (
              <AppText variant="caption" color="textSecondary">
                {facts.dateSource === 'selected'
                  ? 'Porównanie z wybranym terminem: '
                  : 'Porównanie z Waszym przykładowym planem: '}
                {formatTripDates(facts.referenceRange)}.
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="label">
            Wybierz termin, aby porównać wspólne noce.
          </AppText>
        )}
        <AppText variant="label">
          {facts.matchingAgeBands.length
            ? 'Podobny wiek dzieci: ' +
              facts.matchingAgeBands.join(', ') +
              ' lat'
            : group.childAgeBands.length
              ? 'Inne przedziały wieku dzieci niż w Waszych preferencjach.'
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
        <SectionTitle
          title={group.name}
          detail="Przykładowa grupa podróżników"
        />
        <AppText>
          {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          {group.childAgeBands.length
            ? ' · dzieci: ' + group.childAgeBands.join(', ') + ' lat'
            : ' · bez dzieci'}
        </AppText>
        <AppText color="textSecondary">
          {group.homeLocation} · {group.travelModes.join(', ')}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Okolica zamieszkania nie określa miejsca wspólnego wyjazdu.
        </AppText>
      </Card>
      <TripContactAction proposal={proposal} />
      <AppText variant="caption" color="textSecondary">
        Grupy, wyjazdy i wiadomości są fikcyjne.
      </AppText>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  illustration: { borderRadius: Radius.card, overflow: 'hidden' },
});
