import { DataStatus } from '@/components/ui/data-status';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  EmptyState,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { Icon } from '@/components/ui/icon';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import {
  INITIAL_FILTERS,
  resolveDiscoveryRange,
  formatTripDates,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { DiscoveryFiltersSheet } from '@/features/discovery/discovery-filters-sheet';
import { DiscoverySortSheet } from '@/features/discovery/discovery-sort-sheet';
import { DiscoveryFilterBar, DiscoveryResultsHeader } from '@/features/discovery/discovery-controls';
import { useTripSearch } from '@/features/discovery/use-trip-search';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { getPreferredChildAges } from '@/features/profile/profile-data';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { LANDSCAPE_OPTIONS } from '@/constants/landscape-options';
import { GroupsDiscovery } from '@/features/groups/groups-discovery';
import { FavoritesNotice } from '@/features/favorites/favorite-button';

export default function ExploreScreen() {
  const [view, setView] = useState<'trips' | 'groups'>('trips');
  const theme = useTheme();
  const { filters, setFilters, sort, setSort } = useDiscovery();
  const { items: proposals, totalCount, hasMore, status, error, refresh, retry, loadMore } = useTripSearch(filters, sort, 20, view === 'trips');
  const { profile } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const sourceTrip = ownTrips.trips.find(
    (trip) => trip.id === filters.sourceTripId,
  );
  const preferredAges = getPreferredChildAges(profile, filters.childAgeBands);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const dateRange = resolveDiscoveryRange(filters);
  const activeCount =
    Number(filters.tripModes.length === 1) +
    Number(filters.dateRangeId !== 'all') +
    Number(Boolean(filters.location.trim())) +
    Number(filters.childAgeBands.length > 0) +
    Number(Boolean(filters.groupKinds?.length)) +
    Number(Boolean(filters.animalKinds?.length)) +
    Number(Boolean(filters.landscapeKinds?.length)) + Number(Boolean(filters.favoritesOnly));
  const summary = [
    filters.favoritesOnly ? 'Tylko ulubione' : '',
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
      <FavoritesNotice />
      <View style={styles.viewSwitch}
        accessibilityRole="tablist" accessibilityLabel="Odkrywaj">
        <View pointerEvents="none" style={[styles.viewOutline, { borderColor: theme.border }]} />
        {([{ value: 'trips', label: 'Wyjazdy', icon: 'tent' }, { value: 'groups', label: 'Ekipy', icon: 'people' }] as const).map(item => {
          const selected = view === item.value;
          return (
            <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={() => setView(item.value)} style={({ pressed }) => [styles.viewTab, {
                backgroundColor: selected ? theme.primaryStrong : 'transparent',
                opacity: pressed ? 0.8 : 1,
              }]}>
              <Icon name={item.icon} size={20} color={selected ? theme.onPrimary : theme.primaryStrong} />
              <AppText variant="label" color={selected ? 'onPrimary' : 'primaryStrong'} style={styles.viewLabel}>{item.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {view === 'groups' ? <GroupsDiscovery /> : <>
      <DataStatus status={status} error={error} onRetry={() => { void retry(); }} label="Wczytywanie ogłoszeń" />
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
        <DiscoveryFilterBar activeCount={activeCount} summary={summary} placeholder="Typ, termin, miejsce i klimat"
          filterHint="Wybierz typ ogłoszenia, klimat, termin, miejsce i wiek dzieci" refreshLabel="Odśwież ogłoszenia"
          onOpen={() => setShowFilters(true)} onClear={reset} onRefresh={() => void refresh()} />
      </View>
      <View style={styles.results}>
        <DiscoveryResultsHeader title={totalCount === null ? 'Propozycje' : 'Propozycje · ' + totalCount}
          sortLabel={sort === 'compatibility' ? 'Zgodność' : 'Domyślnie'}
          sortAccessibilityLabel={'Sortowanie: ' + (sort === 'compatibility' ? 'Najwyższa zgodność' : 'Domyślnie')}
          onSort={() => setShowSort(true)} />
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
              score={proposal.compatibility.score}
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
        {hasMore && status !== 'loading' ? <Button label="Pokaż więcej wyjazdów" variant="secondary" onPress={() => { void loadMore(); }} /> : null}
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
  viewSwitch: {
    flexDirection: 'row', padding: 3, width: '100%', maxWidth: 280, alignSelf: 'center',
  },
  viewOutline: {
    position: 'absolute', top: 3, right: 3, bottom: 3, left: 3, borderRadius: 999, borderWidth: 1,
  },
  viewTab: {
    flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999,
  },
  viewLabel: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  controls: { gap: 12 },
  results: { gap: 12 },
});
