import { useFocusEffect } from 'expo-router';
import { DataStatus } from '@/components/ui/data-status';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  EmptyState,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import {
  filterProposals,
  INITIAL_FILTERS,
  resolveDiscoveryRange,
  formatTripDates,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { DiscoveryFiltersSheet } from '@/features/discovery/discovery-filters-sheet';
import { DiscoverySortSheet } from '@/features/discovery/discovery-sort-sheet';
import { sortDiscoveryProposals } from '@/features/discovery/sort-proposals';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { getPreferredChildAges } from '@/features/profile/profile-data';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { LANDSCAPE_OPTIONS } from '@/constants/landscape-options';
import { GroupsDiscovery } from '@/features/groups/groups-discovery';

export default function ExploreScreen() {
  const [view, setView] = useState<'trips' | 'groups'>('trips');
  const theme = useTheme();
  const { filters, setFilters, sort, setSort, proposals: availableProposals, compatibility, status, error, refresh } = useDiscovery();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const { profile } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const sourceTrip = ownTrips.trips.find(
    (trip) => trip.id === filters.sourceTripId,
  );
  const preferredAges = getPreferredChildAges(profile, filters.childAgeBands);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const dateRange = resolveDiscoveryRange(filters);
  const proposals = sortDiscoveryProposals(
    filterProposals(availableProposals, filters, dateRange),
    sort,
    Object.fromEntries(Object.entries(compatibility).map(([id, match]) => [id, match.score])),
  );
  const activeCount =
    Number(filters.tripModes.length === 1) +
    Number(filters.dateRangeId !== 'all') +
    Number(Boolean(filters.location.trim())) +
    Number(filters.childAgeBands.length > 0) +
    Number(Boolean(filters.groupKinds?.length)) +
    Number(Boolean(filters.animalKinds?.length)) +
    Number(Boolean(filters.landscapeKinds?.length));
  const summary = [
    filters.tripModes.length === 1
      ? filters.tripModes[0] === 'planned'
        ? 'Mam plan'
        : 'Szukam pomysłu'
      : '',
    dateRange
      ? formatTripDates(dateRange) +
        (filters.dateFlexibilityDays
          ? ` (±${filters.dateFlexibilityDays} ${filters.dateFlexibilityDays === 1 ? 'dzień' : 'dni'})`
          : '')
      : '',
    filters.location.trim(),
    filters.landscapeKinds?.length
      ? 'Klimat: ' +
        LANDSCAPE_OPTIONS.filter((option) =>
          filters.landscapeKinds?.includes(option.value),
        )
          .map((option) => option.label)
          .join(', ')
      : '',
    filters.childAgeBands.length
      ? 'Dzieci ' + filters.childAgeBands.join(', ') + ' lat'
      : '',
    filters.animalKinds?.length
      ? 'Zwierzęta: ' +
        ANIMAL_OPTIONS.filter((option) =>
          filters.animalKinds!.includes(option.kind),
        )
          .map((option) => option.label)
          .join(', ')
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const reset = () => setFilters({ ...INITIAL_FILTERS });
  return (
    <Screen
      header={
        <IllustratedPageHeader
          title="Odkrywaj"
          description={'Znajdź wyjazdy i ludzi\nz podobnymi planami.'}
        />
      }
    >
      <View style={layout.row} accessibilityRole="tablist" accessibilityLabel="Odkrywaj">
        {([{ value: 'trips', label: 'Wyjazdy' }, { value: 'groups', label: 'Ekipy' }] as const).map(item => (
          <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: view === item.value }}
            onPress={() => setView(item.value)} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              borderRadius: 16, backgroundColor: view === item.value ? theme.muted : 'transparent' }}>
            <AppText variant="label" color={view === item.value ? 'primaryStrong' : 'textSecondary'}>{item.label}</AppText>
          </Pressable>
        ))}
      </View>
      {view === 'groups' ? <GroupsDiscovery /> : <>
      <DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Wczytywanie ogłoszeń" />
      <View style={styles.controls}>
        {filters.sourceTripId ? (
          <View style={layout.row}>
            <AppText
              variant="caption"
              color="primaryStrong"
              style={{ flex: 1 }}
            >
              Dla wyjazdu:{' '}
              {sourceTrip ? getTripHeadline(sourceTrip) : 'zapisane kryteria'}
              {filters.groupKinds?.length ? ' · wybrane towarzystwo' : ''}
            </AppText>
            <IconButton
              label="Usuń kryteria wyjazdu"
              icon="close"
              onPress={reset}
            />
          </View>
        ) : null}
        <View style={layout.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otwórz filtry"
            accessibilityHint="Wybierz typ ogłoszenia, klimat, termin, miejsce i wiek dzieci"
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
                {summary || 'Typ, termin, miejsce i klimat'}
              </AppText>
            </View>
            <Icon name="arrow" size={18} />
          </Pressable>
          {activeCount ? (
            <IconButton label="Wyczyść filtry" icon="close" onPress={reset} />
          ) : null}
          <IconButton label="Odśwież ogłoszenia" icon="refresh" onPress={() => { void refresh(); }} />
        </View>
      </View>
      <View style={styles.results}>
        <View style={styles.resultsHeader}>
          <View style={styles.flex}>
            <AppText
              variant="heading"
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              style={styles.resultTitle}
            >
              Propozycje · {proposals.length}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              'Sortowanie: ' +
              (sort === 'compatibility' ? 'Najwyższa zgodność' : 'Domyślnie')
            }
            accessibilityHint="Zmień kolejność wyników"
            onPress={() => setShowSort(true)}
            style={({ pressed }) => [
              styles.sortButton,
              {
                backgroundColor: theme.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon name="sort" size={18} />
            <AppText
              variant="label"
              color="primaryStrong"
              style={styles.sortLabel}
            >
              {sort === 'compatibility' ? 'Zgodność' : 'Domyślnie'}
            </AppText>
          </Pressable>
        </View>
        {proposals.length ? (
          proposals.map((proposal) => (
            <DiscoveryTripCard
              key={proposal.trip.id}
              {...proposal}
              facts={{
                ageBands: proposal.group.childAgeBands,
                matchingAgeBands: proposal.group.childAgeBands.filter((band) =>
                  preferredAges.includes(band),
                ),
              }}
              score={compatibility[proposal.trip.id]?.score}
            />
          ))
        ) : status === 'ready' ? (
          <EmptyState
            title="Jeszcze się mijamy"
            description="Żaden plan nie pasuje do tych filtrów. Zmień klimat wyjazdu lub pozostałe kryteria."
            action={
              <Button label="Pokaż wszystkie propozycje" onPress={reset} />
            }
          />
        ) : null}
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
      {showSort ? (
        <DiscoverySortSheet
          sort={sort}
          onClose={() => setShowSort(false)}
          onSelect={(value) => {
            setSort(value);
            setShowSort(false);
          }}
        />
      ) : null}
      </>}
    </Screen>
  );
}
const styles = StyleSheet.create({
  controls: { gap: 12 },
  flex: { flex: 1 },
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
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    maxWidth: '50%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderRadius: Radius.small,
  },
  sortLabel: { flexShrink: 1 },
  resultTitle: { fontSize: 18, lineHeight: 24 },
});
