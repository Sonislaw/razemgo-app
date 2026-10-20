import { getTripHeadline } from '@/features/trips/trip-headline';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatTripDates,
  getTripLocation,
} from '@/features/discovery/filter-trips';
import type { MatchFacts } from '@/features/discovery/filter-trips';
import type { TripProposal } from '@/types/travel';
import { CompactTripCard } from './compact-trip-card';
import { TripCardHeading } from './trip-card-heading';
import { TripAnimalTag } from '@/features/animals/animal-ui';

interface DiscoveryTripCardProps extends TripProposal {
  facts: Pick<MatchFacts, 'ageBands' | 'matchingAgeBands'>;
  demoScore?: number;
}
export function DiscoveryTripCard({
  trip,
  group,
  facts,
  demoScore,
}: DiscoveryTripCardProps) {
  const theme = useTheme();
  const score = demoScore;
  const ages = facts.matchingAgeBands.length
    ? facts.matchingAgeBands
    : facts.ageBands;
  return (
    <CompactTripCard>
      <View style={styles.topRow}>
        <AppText variant="caption" color="primaryStrong" style={styles.flex}>
          {trip.mode === 'planned' ? 'MAM PLAN' : 'SZUKAM POMYSŁU'}
        </AppText>
        {score !== undefined ? (
          <View
            style={[
              styles.score,
              {
                backgroundColor: theme.positiveBackground,
              },
            ]}
          >
            <AppText variant="caption" color="positive" style={styles.bold}>
              {score}% zgodności
            </AppText>
          </View>
        ) : null}
      </View>
      <TripCardHeading title={getTripHeadline(trip)} landscape={trip.landscape} />
      <View style={layout.row}>
        <Icon name="pin" size={16} />
        <AppText variant="label" color="textSecondary" style={styles.flex}>
          {getTripLocation(trip)}
          {trip.mode === 'flexible' ? ' · cel do ustalenia' : ''}
        </AppText>
      </View>
      <View style={layout.row}>
        <Icon name="calendar" size={16} />
        <AppText variant="caption" color="textSecondary" style={styles.flex}>
          {formatTripDates(trip)}
        </AppText>
      </View>
      <View style={styles.facts}>
        <View style={[styles.fact, { backgroundColor: theme.muted }]}>
          <Icon name="people" size={15} />
          <AppText variant="caption" style={styles.shrink}>
            {ages.length
              ? 'Dzieci ' + ages.join(', ') + ' lat'
              : group.childCount
                ? 'Wiek dzieci niepodany'
                : 'Bez dzieci'}
          </AppText>
        </View>
      </View>
      <TripAnimalTag animals={trip.animals} />
      <AppText variant="caption" color="textSecondary">
        {group.name} · {group.adultCount}{' '}
        {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
      </AppText>
      <Button
        label="Zobacz wyjazd"
        icon="arrow"
        variant="secondary"
        onPress={() =>
          router.push({ pathname: '/trip/[id]', params: { id: trip.id } })
        }
      />
    </CompactTripCard>
  );
}
const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  bold: { fontWeight: '700' },
  score: {
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.small,
    maxWidth: '100%',
  },
});
