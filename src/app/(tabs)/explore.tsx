import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  EmptyState,
  PageHeader,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { DEMO_DATE_RANGES, DEMO_PROPOSALS } from '@/data/mocks/travel';
import { DEMO_COMPATIBILITY_SCORES } from '@/data/mocks/compatibility';
import {
  filterProposals,
  getMatchFacts,
  INITIAL_FILTERS,
  resolveDiscoveryRange,
  formatTripDates,
  getDiscoveryReferenceRange,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { DiscoveryFiltersSheet } from '@/features/discovery/discovery-filters-sheet';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { getPreferredChildAges } from '@/features/profile/profile-data';
import type { TripMode } from '@/types/travel';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { isArchivedTrip, todayDate } from '@/features/trips/own-trips-state';

const modes: { mode: TripMode; label: string }[] = [
  { mode: 'planned', label: 'Mam plan' },
  { mode: 'flexible', label: 'Szukam pomysłu' },
];
export default function ExploreScreen() {
  const theme = useTheme();
  const { filters, setFilters } = useDiscovery();
  const { profile } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const ownPlans = ownTrips.trips.filter(
    (trip) => trip.status !== 'draft' && !isArchivedTrip(trip, todayDate()),
  );
  const [showFilters, setShowFilters] = useState(false);
  const dateRange = resolveDiscoveryRange(filters, DEMO_DATE_RANGES);
  const proposals = filterProposals(DEMO_PROPOSALS, filters, dateRange);
  const activeCount =
    Number(filters.dateRangeId !== 'all') +
    Number(Boolean(filters.location.trim())) +
    Number(filters.childAgeBands.length > 0) +
    Number(Boolean(filters.groupKinds?.length));
  const summary = [
    filters.dateRangeId === 'own-trip' && dateRange
      ? formatTripDates(dateRange)
      : DEMO_DATE_RANGES.find((range) => range.id === filters.dateRangeId)
          ?.label,
    filters.location.trim(),
    filters.childAgeBands.length
      ? 'Dzieci ' + filters.childAgeBands.join(', ') + ' lat'
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const reset = () => setFilters({ ...INITIAL_FILTERS, mode: filters.mode });
  return (
    <Screen>
      <View style={styles.controls}>
        <PageHeader title="Odkrywaj" />
        {filters.sourceTripId ? (
          <View style={layout.row}>
            <AppText
              variant="caption"
              color="primaryStrong"
              style={{ flex: 1 }}
            >
              Dla wyjazdu:{' '}
              {ownTrips.trips.find((trip) => trip.id === filters.sourceTripId)
                ?.title ?? 'zapisane kryteria'}
              {filters.groupKinds?.length ? ' · wybrane towarzystwo' : ''}
            </AppText>
            <IconButton
              label="Usuń kryteria wyjazdu"
              icon="close"
              onPress={reset}
            />
          </View>
        ) : null}
        <View
          accessibilityRole="tablist"
          style={[styles.segment, { backgroundColor: theme.muted }]}
        >
          {modes.map(({ mode, label }) => (
            <Pressable
              key={mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: filters.mode === mode }}
              accessibilityLabel={label}
              onPress={() => setFilters((current) => ({ ...current, mode }))}
              style={({ pressed }) => [
                styles.segmentItem,
                {
                  backgroundColor:
                    filters.mode === mode
                      ? theme.backgroundElement
                      : theme.muted,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText
                variant="label"
                color={
                  filters.mode === mode ? 'primaryStrong' : 'textSecondary'
                }
                style={{ textAlign: 'center' }}
              >
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View style={layout.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otwórz filtry"
            accessibilityHint="Wybierz termin, miejsce i wiek dzieci"
            onPress={() => setShowFilters(true)}
            style={({ pressed }) => [
              styles.filterBar,
              {
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon name="filters" size={21} />
            <View style={styles.flex}>
              <AppText variant="label">
                Filtry{activeCount ? ' · ' + activeCount : ''}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {summary || 'Termin, miejsce, wiek dzieci'}
              </AppText>
            </View>
            <Icon name="arrow" size={18} />
          </Pressable>
          {activeCount ? (
            <IconButton label="Wyczyść filtry" icon="close" onPress={reset} />
          ) : null}
        </View>
      </View>
      <View style={styles.results}>
        <View style={styles.resultsHeader}>
          <AppText
            variant="heading"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={styles.resultTitle}
          >
            Propozycje dla Was · {proposals.length}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Dane demonstracyjne
          </AppText>
        </View>
        <View style={{ gap: 4 }}>
          <AppText
            variant="caption"
            color="primaryStrong"
            accessibilityLiveRegion="polite"
          >
            {filters.mode === 'planned'
              ? 'Najpierw ekipy szukające pomysłu.'
              : 'Najpierw wyjazdy z ustalonym celem.'}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {dateRange
              ? filters.dateRangeId === 'own-trip' &&
                filters.dateFlexibilityDays
                ? `Możliwe wspólne noce po przesunięciu wyjazdu o maks. ${filters.dateFlexibilityDays} dni.`
                : 'Wspólne noce według wybranego terminu.'
              : 'Wspólne noce według Waszych przykładowych planów.'}
          </AppText>
        </View>
        {proposals.length ? (
          proposals.map((proposal) => (
            <DiscoveryTripCard
              key={proposal.trip.id}
              {...proposal}
              facts={getMatchFacts(
                proposal,
                profile.group,
                ownPlans,
                getDiscoveryReferenceRange(filters, dateRange, proposal.trip),
                getPreferredChildAges(profile, filters.childAgeBands),
              )}
              demoScore={DEMO_COMPATIBILITY_SCORES[proposal.trip.id]}
            />
          ))
        ) : (
          <EmptyState
            title="Jeszcze się mijamy"
            description="Żaden przykładowy plan nie pasuje do tych filtrów. Spróbuj innego regionu, terminu lub wieku dzieci."
            action={
              <Button label="Pokaż wszystkie propozycje" onPress={reset} />
            }
          />
        )}
      </View>
      {showFilters ? (
        <DiscoveryFiltersSheet
          initialFilters={filters}
          onClose={() => setShowFilters(false)}
          onApply={(nextFilters) => {
            setFilters(nextFilters);
            setShowFilters(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  controls: { gap: 12 },
  flex: { flex: 1 },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.small,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segmentItem: {
    flex: 1,
    minHeight: 48,
    padding: 8,
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  filterBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    padding: 12,
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.small,
  },
  results: { gap: 12 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  resultTitle: { fontSize: 18, lineHeight: 24 },
});
