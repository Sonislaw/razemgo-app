import { CollectionScreen } from '@/components/ui/collection-screen';
import { DataStatus } from '@/components/ui/data-status';
import { Button, EmptyState } from '@/components/ui/primitives';
import { USE_DEMO_DATA } from '@/constants/app';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { useDiscovery } from '@/features/discovery/discovery-context';
import {
  DiscoveryFilterBar,
  DiscoveryResultsHeader,
} from '@/features/discovery/discovery-controls';
import { useFavorites } from '@/features/favorites/favorites-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import { isPresenceActive } from '@/features/presence/presence-context';
import { PRESENCE_POLL_MS } from '@/features/presence/presence-controller';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { useTheme } from '@/hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, Platform } from 'react-native';
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

const EMPTY_PAGE: GroupPage = {
  items: [],
  totalCount: 0,
  hasMore: false,
  cursor: null,
};


export function GroupsDiscovery({
  header,
  beforeList,
}: {
  header?: ReactNode;
  beforeList?: ReactNode;
}) {
  const {
    groupFilters: filters,
    setGroupFilters: setFilters,
  } = useDiscovery();
  const theme = useTheme();
  const [showFilters, setShowFilters] = useState(false);
  const { store: favoritesStore } = useFavorites();
  const [page, setPage] = useState<GroupPage>(EMPTY_PAGE);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const loadingMore = useRef(false);
  const currentPage = useRef(page);
  const failedRequest = useRef<'load' | 'more'>('load');
  const returnLoad = useRef<((quiet?: boolean) => Promise<void>) | null>(null);
  const publishPage = useCallback((next: GroupPage) => {
    currentPage.current = next;
    setPage(next);
  }, []);
  const { state: mailbox } = useMessaging();
  const blocked = mailbox.blockedGroupIds;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
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
  const load = useCallback(
    async (quiet = false) => {
      if (quiet && loadingMore.current) return;
      const version = ++generation.current;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      loadingMore.current = true;
      failedRequest.current = 'load';
      const desiredCount = quiet
        ? Math.max(GROUP_SEARCH_PAGE_SIZE, currentPage.current.items.length)
        : GROUP_SEARCH_PAGE_SIZE;
      if (!quiet) {
        setStatus('loading');
        setError(null);
        setIsLoadingMore(false);
        setHasLoaded(false);
        publishPage(EMPTY_PAGE);
      }
      try {
        let result = await fetchPage(undefined, controller.signal);
        if (
          quiet &&
          !USE_DEMO_DATA &&
          currentPage.current.items.length > GROUP_SEARCH_PAGE_SIZE
        ) {
          const fresh = await refreshGroupResults(
            currentPage.current.items.map((item) => item.group.id),
            filters,
            controller.signal,
          );
          const byId = new Map(fresh.map((item) => [item.group.id, item]));
          const retained = currentPage.current.items.flatMap((item) =>
            byId.has(item.group.id) ? [byId.get(item.group.id)!] : [],
          );
          const items = [
            ...new Map(
              [...result.items, ...retained].map((item) => [
                item.group.id,
                item,
              ]),
            ).values(),
          ];
          result = {
            ...result,
            items,
            cursor: currentPage.current.cursor ?? result.cursor,
            hasMore:
              items.length < result.totalCount &&
              !!(currentPage.current.cursor ?? result.cursor),
          };
        }
        while (
          USE_DEMO_DATA &&
          result.hasMore &&
          result.cursor &&
          result.items.length < desiredCount &&
          alive.current &&
          version === generation.current
        ) {
          const previous = result.cursor;
          const next = await fetchPage(previous);
          if (
            next.hasMore &&
            (!next.cursor ||
              JSON.stringify(next.cursor) === JSON.stringify(previous))
          )
            throw new Error('Invalid cursor progression');
          result = {
            ...next,
            items: [
              ...new Map(
                [...result.items, ...next.items].map((item) => [
                  item.group.id,
                  item,
                ]),
              ).values(),
            ],
          };
        }
        if (alive.current && version === generation.current) {
          publishPage(result);
          setHasLoaded(true);
          setStatus('ready');
          setError(null);
        }
      } catch (e) {
        if (alive.current && version === generation.current) {
          failedRequest.current = 'load';
          setError(groupDirectoryError(e));
          setStatus('error');
        }
      } finally {
        if (version === generation.current) loadingMore.current = false;
      }
    },
    [fetchPage, publishPage, filters],
  );
  const preserveOnReturn = useCallback(() => {
    returnLoad.current = load;
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      const restore = returnLoad.current === load;
      returnLoad.current = null;
      void load(restore);
      const dynamic = filters.onlineOnly || filters.favoritesOnly;
      const refreshOnline = () => {
        if (dynamic && isPresenceActive()) void load(true);
      };
      const timer = dynamic
        ? setInterval(refreshOnline, PRESENCE_POLL_MS)
        : undefined;
      const foreground = dynamic
        ? AppState.addEventListener('change', refreshOnline)
        : null;
      if (dynamic && Platform.OS === 'web')
        document.addEventListener('visibilitychange', refreshOnline);
      let revision = favoritesStore?.getSnapshot().revision;
      const unsubscribe = favoritesStore?.subscribe(() => {
        const next = favoritesStore.getSnapshot().revision;
        if (next !== revision && filters.favoritesOnly) refreshOnline();
        revision = next;
      });
      return () => {
        generation.current++;
        request.current?.abort();
        loadingMore.current = false;
        setIsLoadingMore(false);
        clearInterval(timer);
        foreground?.remove();
        unsubscribe?.();
        if (dynamic && Platform.OS === 'web')
          document.removeEventListener('visibilitychange', refreshOnline);
      };
    }, [load, filters.onlineOnly, filters.favoritesOnly, favoritesStore]),
  );
  const more = async () => {
    if (!page.hasMore || !page.cursor || loadingMore.current) return;
    loadingMore.current = true;
    const version = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading');
    setError(null);
    setIsLoadingMore(true);
    try {
      const next = await fetchPage(page.cursor, controller.signal);
      if (
        next.hasMore &&
        (!next.cursor ||
          JSON.stringify(next.cursor) === JSON.stringify(page.cursor))
      )
        throw new Error('Invalid cursor progression');
      if (alive.current && version === generation.current) {
        publishPage({
          ...next,
          items: [
            ...new Map(
              [...currentPage.current.items, ...next.items].map((x) => [
                x.group.id,
                x,
              ]),
            ).values(),
          ],
        });
        setHasLoaded(true);
        setStatus('ready');
      }
    } catch (e) {
      if (alive.current && version === generation.current) {
        failedRequest.current = 'more';
        setError(groupDirectoryError(e));
        setStatus('error');
      }
    } finally {
      if (alive.current && version === generation.current) {
        loadingMore.current = false;
        setIsLoadingMore(false);
      }
    }
  };
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
            refreshLabel="Odśwież ekipy"
            onOpen={() => setShowFilters(true)}
            onClear={reset}
            onRefresh={() => void load(true)}
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
            onRetry={() => {
              void (failedRequest.current === 'more' ? more() : load(true));
            }}
          />
          {status === 'ready' && !items.length ? (
            <EmptyState
              title="Jeszcze nie ma tu ekip"
              description="Zmień filtry albo wróć później. W wyszukiwarce pojawiają się widoczne profile ekip."
              action={<Button label="Pokaż wszystkie ekipy" onPress={reset} />}
            />
          ) : null}
          {page.hasMore && (status !== 'loading' || isLoadingMore) ? (
            <Button
              label={isLoadingMore ? 'Wczytywanie ekip' : 'Pokaż więcej ekip'}
              variant="secondary"
              disabled={isLoadingMore}
              leading={
                isLoadingMore ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.primaryStrong}
                    accessibilityLabel="Wczytywanie kolejnych ekip"
                  />
                ) : undefined
              }
              onPress={() => void more()}
            />
          ) : null}
          <Button
            label="Ustaw widoczność mojej ekipy"
            variant="secondary"
            onPress={() => router.push('/group-visibility')}
          />
        </>
      }
    >
      {showFilters ? (
        <GroupFiltersSheet
          filters={filters}
          onClose={() => setShowFilters(false)}
          onApply={(next) => {
            setFilters(next);
            setShowFilters(false);
          }}
        />
      ) : null}
    </CollectionScreen>
  );
}
