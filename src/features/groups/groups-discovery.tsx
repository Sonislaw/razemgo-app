import { CollectionScreen } from '@/components/ui/collection-screen';
import { DataStatus } from '@/components/ui/data-status';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Button, EmptyState } from '@/components/ui/primitives';
import { USE_DEMO_DATA } from '@/constants/app';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { useDiscovery } from '@/features/discovery/discovery-context';
import {
  DiscoveryFilterBar,
  DiscoveryResultsHeader,
} from '@/features/discovery/discovery-controls';
import { useFavoritesStore } from '@/features/favorites/favorites-context';
import { useMessagingSelector } from '@/features/messaging/messaging-context';
import { isPresenceActive } from '@/features/presence/presence-context';
import { PRESENCE_POLL_MS } from '@/features/presence/presence-controller';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { useFocusEffect } from 'expo-router';
import {
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { createPagedResource } from '@/lib/paged-resource';
import { GroupCard } from './group-card';
import {
  filterPublicGroups,
  GROUP_SEARCH_PAGE_SIZE,
  groupDirectoryError,
  INITIAL_GROUP_FILTERS,
  sortPublicGroups,
  type GroupPage,
  type RankedGroupCursor,
} from './group-data';
import { DEMO_PUBLIC_GROUPS } from './group-demo';
import { GroupFiltersSheet } from './group-filters-sheet';
import { fetchPublicGroups, refreshGroupResults } from './group-repository';

export function GroupsDiscovery({
  header,
  beforeList,
}: {
  header?: ReactNode;
  beforeList?: ReactNode;
}) {
  const { groupFilters: filters, setGroupFilters: setFilters } = useDiscovery();
  const favoritesStore = useFavoritesStore();
  const blocked = useMessagingSelector((value) => value.state.blockedGroupIds);
  const returnLoad = useRef<(() => Promise<void>) | null>(null);
  const fetchPage = useCallback(
    async (
      cursor?: RankedGroupCursor,
      signal?: AbortSignal,
    ): Promise<GroupPage> => {
      if (!USE_DEMO_DATA)
        return fetchPublicGroups(filters, cursor, undefined, signal);
      const sorted = sortPublicGroups(
        filterPublicGroups(
          DEMO_PUBLIC_GROUPS,
          filters,
          undefined,
          favoritesStore?.getSnapshot().groupIds,
        ),
      );
      const offset = cursor
        ? sorted.findIndex((item) => item.group.id === cursor.id) + 1
        : 0;
      const items = sorted.slice(offset, offset + GROUP_SEARCH_PAGE_SIZE);
      const last = items.at(-1);
      return {
        items,
        totalCount: sorted.length,
        hasMore: offset + items.length < sorted.length,
        cursor: last
          ? {
              id: last.group.id,
              name: last.group.name,
              version: 3,
            }
          : null,
      };
    },
    [filters, favoritesStore],
  );
  const store = useMemo(
    () =>
      createPagedResource({
        load: fetchPage,
        key: (item: GroupPage['items'][number]) => item.group.id,
        error: groupDirectoryError,
        refreshItems: USE_DEMO_DATA
          ? undefined
          : (items, signal) =>
              refreshGroupResults(
                items.map((item) => item.group.id),
                filters,
                signal,
              ),
      }),
    [fetchPage, filters],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const page = snapshot.page ?? {
    items: [],
    totalCount: 0,
    hasMore: false,
    cursor: null,
  };
  const { status, error, loadingMore: isLoadingMore } = snapshot;
  const hasLoaded = !!snapshot.page;
  const load = store.refresh;
  const more = store.more;
  const preserveOnReturn = useCallback(() => {
    returnLoad.current = load;
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      const restore = returnLoad.current === load;
      returnLoad.current = null;
      void (restore ? store.refresh() : store.restart());
      const refreshOnline = () => {
        if (isPresenceActive() && store.getSnapshot().status !== 'loading')
          void store.refresh();
      };
      const timer = filters.onlineOnly
        ? setInterval(refreshOnline, PRESENCE_POLL_MS)
        : undefined;
      const foreground = AppState.addEventListener('change', refreshOnline);
      if (Platform.OS === 'web')
        document.addEventListener('visibilitychange', refreshOnline);
      let revision = favoritesStore?.getSnapshot().revision;
      const unsubscribe = favoritesStore?.subscribe(() => {
        const next = favoritesStore.getSnapshot().revision;
        if (next !== revision && filters.favoritesOnly) refreshOnline();
        revision = next;
      });
      return () => {
        store.stop();
        clearInterval(timer);
        foreground.remove();
        unsubscribe?.();
        if (Platform.OS === 'web')
          document.removeEventListener('visibilitychange', refreshOnline);
      };
    }, [
      store,
      load,
      filters.onlineOnly,
      filters.favoritesOnly,
      favoritesStore,
    ]),
  );
  const items = page.items.filter((x) => !blocked.includes(x.group.id));
  const activeCount =
    Number(Boolean(filters.name.trim())) +
    Number(Boolean(filters.groupKinds.length)) +
    Number(Boolean(filters.childAgeBands.length)) +
    Number(Boolean(filters.travelModes.length)) +
    Number(Boolean(filters.interests.length)) +
    Number(Boolean(filters.animalKinds.length)) +
    Number(filters.hasTrips) +
    Number(filters.onlineOnly) +
    Number(filters.favoritesOnly);
  const summary = [
    filters.name.trim() ? 'Nazwa: ' + filters.name.trim() : '',
    GROUP_KIND_OPTIONS.filter((option) =>
      filters.groupKinds.includes(option.value),
    )
      .map((option) => option.label)
      .join(', '),
    filters.childAgeBands.length
      ? 'Dzieci ' + filters.childAgeBands.join(', ') + ' lat'
      : '',
    filters.travelModes
      .map((mode) => (mode === 'Van' ? 'Kampervan' : mode))
      .join(', '),
    filters.interests.join(', '),
    filters.animalKinds.length
      ? 'Zwierzęta: ' +
        ANIMAL_OPTIONS.filter((option) =>
          filters.animalKinds.includes(option.kind),
        )
          .map((option) => option.label)
          .join(', ')
      : '',
    filters.hasTrips ? 'Z aktywnymi ogłoszeniami' : '',
    filters.onlineOnly ? 'Tylko online' : '',
    filters.favoritesOnly ? 'Tylko ulubione' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const reset = () => setFilters({ ...INITIAL_GROUP_FILTERS });
  return (
    <CollectionScreen
      testID="discovery-screen"
      header={header}
      data={items}
      itemGap={16}
      keyExtractor={(item) => item.group.id}
      renderItem={({ item }) => (
        <GroupCard item={item} onNavigate={preserveOnReturn} />
      )}
      beforeList={
        <>
          {beforeList}
          <DiscoveryFilterBar
            activeCount={activeCount}
            summary={summary}
            placeholder="Nazwa, rodzaj ekipy i zainteresowania"
            filterLabel="Filtry ekip"
            filterHint="Wybierz nazwę, rodzaj ekipy, wiek dzieci i sposób podróżowania"
            clearLabel="Wyczyść filtry ekip"
            renderFilters={(onClose) => (
              <GroupFiltersSheet
                filters={filters}
                onClose={onClose}
                onApply={(next) => {
                  setFilters(next);
                  onClose();
                }}
              />
            )}
            onClear={reset}
          />
          <DiscoveryResultsHeader
            title={hasLoaded ? 'Ekipy · ' + page.totalCount : 'Ekipy'}
          />
        </>
      }
      afterList={
        <>
          <DataStatus
            status={isLoadingMore ? 'ready' : status}
            error={error}
            label="Wczytywanie ekip"
            onRetry={() => void store.retry()}
          />
          {status === 'ready' && !items.length ? (
            <EmptyState
              title="Jeszcze nie ma tu ekip"
              description="Zmień filtry albo wróć później. Nowe ekipy pojawiają się po uzupełnieniu profilu."
              action={<Button label="Pokaż wszystkie ekipy" onPress={reset} />}
            />
          ) : null}
          {page.hasMore && (status !== 'loading' || isLoadingMore) ? (
            <LoadMoreButton
              label="Pokaż więcej ekip"
              loadingLabel="Wczytywanie ekip"
              loadingAccessibilityLabel="Wczytywanie kolejnych ekip"
              loading={isLoadingMore}
              onPress={() => void more()}
            />
          ) : null}
        </>
      }
    />
  );
}
