import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import {
  AppText,
  Button,
  Card,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { createPagedResource } from '@/lib/paged-resource';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { formatTripDates, getTripLocation } from '../filter-trips';
import { fetchMapItems } from './map-repository';
import { useTheme } from '@/hooks/use-theme';
import type { DiscoveryFilters } from '@/types/travel';
import type {
  MapCursor,
  MapItemsPage,
  MapProposal,
  MapQuery,
} from './map-data';

export function MapSelection({
  userId,
  filters,
  query,
  selection,
  onChoose,
  onClose,
}: {
  userId: string;
  filters: DiscoveryFilters;
  query: MapQuery;
  selection: { key: string; count: number };
  onChoose: (item: MapProposal) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const store = useMemo(
    () =>
      createPagedResource<MapProposal, MapCursor, MapItemsPage>({
        load: (cursor, signal) =>
          fetchMapItems(userId, filters, query, selection.key, cursor, signal),
        key: (item) => item.trip.id,
        error: () => 'Nie udało się pobrać wyjazdów. Spróbuj ponownie.',
      }),
    [userId, filters, query, selection.key],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    void store.restart();
    return () => store.stop();
  }, [store]);
  const page = state.page;
  useEffect(() => {
    if (page?.totalCount === 1 && page.items[0]) onChoose(page.items[0]);
  }, [page, onChoose]);
  // Decide from the fetched results before mounting an animated sheet.
  // A single result goes directly to the map preview, even if a group shrank.
  if (page?.totalCount === 1 && page.items[0]) return null;
  if (!page || page.totalCount === 0)
    return (
      <Card style={styles.feedback}>
        <View style={layout.row}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={theme.primaryStrong} />
          ) : null}
          <AppText
            variant="caption"
            accessibilityRole={state.error ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            style={{ flex: 1 }}
          >
            {state.error ??
              (page?.totalCount === 0
                ? 'Brak dostępnych wyjazdów w tym miejscu.'
                : selection.count === 1
                  ? 'Wczytywanie wyjazdu…'
                  : 'Wczytywanie wyjazdów…')}
          </AppText>
          <IconButton
            icon="close"
            label="Zamknij wybór wyjazdu"
            onPress={onClose}
          />
        </View>
        {state.error ? (
          <Button
            label="Spróbuj ponownie"
            variant="secondary"
            onPress={() => void store.retry()}
          />
        ) : null}
      </Card>
    );
  return (
    <BottomSheet title="Wyjazdy w tym miejscu" onClose={onClose}
      pagination={{itemCount:page.items.length,hasMore:page.hasMore,loading:state.loadingMore,
        disabled:state.status==='loading',error:state.error,resetKey:store,
        loadingLabel:'Wczytywanie kolejnych wyjazdów…',onLoadMore:store.more,onRetry:store.retry}}>
      <DataStatus
        status={page.items.length && page.hasMore ? 'ready' : state.status}
        error={state.error}
        label="Wczytywanie wyjazdów"
        onRetry={() => void store.retry()}
      />
      {page ? (
        <AppText variant="caption" color="textSecondary">
          Wyniki: {page.totalCount}
        </AppText>
      ) : null}
      {page?.items.map((item) => (
        <Pressable
          key={item.trip.id}
          accessibilityRole="button"
          accessibilityLabel={'Wybierz wyjazd: ' + getTripHeadline(item.trip)}
          onPress={() => onChoose(item)}
          style={({ pressed }) => ({
            paddingVertical: 12,
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AppText variant="label" numberOfLines={2}>
            {getTripHeadline(item.trip)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {formatTripDates(item.trip)} · {getTripLocation(item.trip)}
          </AppText>
          <View style={layout.row}>
            <GroupAvatar
              groupId={item.group.id}
              avatarId={item.group.avatarId}
              size={28}
            />
            <AppText variant="caption">{item.group.name}</AppText>
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}
const styles = StyleSheet.create({
  feedback: { position: 'absolute', left: 12, right: 12, bottom: 32, gap: 8 },
});
