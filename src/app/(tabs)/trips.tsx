import { DataStatus } from '@/components/ui/data-status';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { useTheme } from '@/hooks/use-theme';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  EMPTY_TRIP_FILTERS,
  isArchivedTrip,
  selectOwnTrips,
  todayDate,
} from '@/features/trips/own-trips-state';
import { OwnTripCard } from '@/features/trips/trip-ui';
import { TripActions } from '@/features/trips/trip-actions';
import { OwnTripFiltersSheet } from '@/features/trips/own-trip-filters';
import type { OwnTripFilters } from '@/types/owned-trip';
import { CollectionScreen } from '@/components/ui/collection-screen';

export default function TripsScreen() {
  const { state, refresh } = useOwnTrips();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <TripsContent key={state.revision} />;
}
function TripsContent() {
  const { state, status, error, refresh } = useOwnTrips();
  const theme = useTheme();
  const [archived, setArchived] = useState(() => {
    const saved = state.trips.find((trip) => trip.id === state.lastSavedId);
    return saved ? isArchivedTrip(saved, todayDate()) : false;
  });
  const [filters, setFilters] = useState<OwnTripFilters>({
    ...EMPTY_TRIP_FILTERS,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noticeId, setNoticeId] = useState<string | null>(
    state.lastSavedId ?? null,
  );
  const today = todayDate();
  const trips = selectOwnTrips(state.trips, filters, archived, today);
  const activeCount = state.trips.filter(
    (trip) => !isArchivedTrip(trip, today),
  ).length;
  const archiveCount = state.trips.length - activeCount;
  const selected = state.trips.find((trip) => trip.id === selectedId);
  const filtered = Boolean(
    filters.query.trim() || filters.startDate || filters.endDate,
  );
  const add = () => router.push('/trip-editor');
  const notice = state.trips.find((trip) => trip.id === noticeId);
  return (
    <>
      <CollectionScreen
        key={noticeId ?? 'initial'}
        testID="own-trips-screen"
        data={trips}
        keyExtractor={trip => trip.id}
        renderItem={({ item: trip }) => <OwnTripCard trip={trip} onMenu={() => setSelectedId(trip.id)} />}
        header={
          <IllustratedPageHeader
            title="Moje wyjazdy"
            description={'Twoje plany\ni wspólne przygody.'}
            actions={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dodaj wyjazd"
                onPress={add}
                style={({ pressed }) => ({
                  minHeight: 48,
                  borderRadius: 14,
                  backgroundColor: theme.primaryStrong,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Icon name="plus" size={20} color={theme.onPrimary} />
                <AppText variant="label" style={{ color: theme.onPrimary }}>
                  Dodaj
                </AppText>
              </Pressable>
            }
          />
        }
        beforeList={
        <View style={{ gap: 12 }}>
          <DataStatus status={status === 'loading' && state.trips.length ? 'ready' : status} error={error} onRetry={() => { void refresh(); }} />
          {notice ? (
            <View
              accessibilityLiveRegion="polite"
              style={[
                layout.row,
                {
                  backgroundColor: theme.positiveBackground,
                  borderRadius: 16,
                  padding: 12,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  'Zobacz zapisany wyjazd: ' + getTripHeadline(notice)
                }
                onPress={() =>
                  router.push({
                    pathname: '/trips/[id]',
                    params: { id: notice.id },
                  })
                }
                style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
              >
                <AppText variant="label" color="positive">
                  Zapisano: {getTripHeadline(notice)}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  Zobacz wyjazd →
                </AppText>
              </Pressable>
              <IconButton
                label="Ukryj potwierdzenie zapisu"
                icon="close"
                onPress={() => setNoticeId(null)}
              />
            </View>
          ) : null}
          <View style={layout.row}>
            <View
              accessibilityRole="tablist"
              style={{
                flex: 1,
                flexDirection: 'row',
                padding: 4,
                borderRadius: 16,
                backgroundColor: theme.muted,
                gap: 4,
              }}
            >
              {[
                { label: 'Aktywne', value: false, count: activeCount },
                { label: 'Archiwum', value: true, count: archiveCount },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="tab"
                  aria-selected={archived === item.value}
                  accessibilityLabel={item.label + ', ' + item.count}
                  accessibilityState={{ selected: archived === item.value }}
                  onPress={() => setArchived(item.value)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    padding: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor:
                      archived === item.value
                        ? theme.backgroundElement
                        : 'transparent',
                  }}
                >
                  <AppText
                    variant="label"
                    color={
                      archived === item.value
                        ? 'primaryStrong'
                        : 'textSecondary'
                    }
                    style={{ textAlign: 'center' }}
                  >
                    {item.label} · {item.count}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <IconButton
              icon="filters"
              label="Filtruj moje wyjazdy"
              onPress={() => setFilterOpen(true)}
            />
            <IconButton label="Odśwież wyjazdy" icon="refresh" onPress={() => { void refresh(); }} />
          </View>
          {filtered ? (
            <View style={layout.row}>
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ flex: 1 }}
              >
                {[
                  filters.query,
                  filters.startDate && 'Od: ' + filters.startDate,
                  filters.endDate && 'Do: ' + filters.endDate,
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                · {trips.length} wyników
              </AppText>
              <IconButton
                label="Wyczyść filtry wyjazdów"
                icon="close"
                onPress={() => setFilters({ ...EMPTY_TRIP_FILTERS })}
              />
            </View>
          ) : null}
        </View>}
        empty={status === 'ready' ? (
            <View
              style={{ gap: 12, paddingVertical: 24, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: theme.hero,
                  borderRadius: 20,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Icon name="trips" size={30} />
              </View>
              <AppText
                accessibilityRole="header"
                variant="heading"
                style={{ textAlign: 'center' }}
              >
                {filtered
                  ? 'Brak pasujących wyjazdów'
                  : archived
                    ? 'Jeszcze bez wspomnień w archiwum'
                    : 'Dokąd wybierzesz się z ekipą?'}
              </AppText>
              <AppText
                color="textSecondary"
                style={{ fontSize: 14, lineHeight: 21, textAlign: 'center' }}
              >
                {filtered
                  ? 'Spróbuj innego miejsca lub terminu.'
                  : archived
                    ? 'Zakończone i anulowane plany znajdziesz tutaj.'
                    : 'Masz konkretny cel albo wolny termin? Zapisz swój pierwszy plan.'}
              </AppText>
              <View style={{ alignSelf: 'stretch' }}>
                <Button
                  label={
                    filtered
                      ? 'Pokaż wszystkie wyjazdy'
                      : archived
                        ? 'Zobacz aktywne wyjazdy'
                        : 'Zaplanuj pierwszy wyjazd'
                  }
                  icon={filtered ? 'refresh' : archived ? 'trips' : 'plus'}
                  onPress={() =>
                    filtered
                      ? setFilters({ ...EMPTY_TRIP_FILTERS })
                      : archived
                        ? setArchived(false)
                        : add()
                  }
                />
              </View>
            </View>
          ) : null}
      />
      {selected ? (
        <TripActions trip={selected} onClose={() => setSelectedId(null)} />
      ) : null}
      {filterOpen ? (
        <OwnTripFiltersSheet
          initial={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setFilters(next);
            setFilterOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
