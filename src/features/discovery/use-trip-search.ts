import { USE_DEMO_DATA } from '@/constants/app';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useAuth } from '@/features/auth/auth-context';
import { useFavorites } from '@/features/favorites/favorites-context';
import { useProfile } from '@/features/profile/profile-context';
import type { DiscoveryFilters } from '@/types/travel';
import { useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useDiscovery } from './discovery-context';
import {
  discoveryError,
  discoveryFiltersPayload,
  TRIP_SEARCH_PAGE_SIZE,
  type DiscoveryTripProposal,
  type TripSearchCursor,
} from './discovery-data';
import {
  fetchDiscoveryTrip,
  fetchTripCount,
  fetchTripPage,
  refreshTripResults,
} from './discovery-repository';
import { createTripSearchStore } from './discovery-store';
import { filterProposals } from './filter-trips';

export function useTripSearch(
  filters: DiscoveryFilters,
  pageSize = TRIP_SEARCH_PAGE_SIZE,
  enabled = true,
) {
  const { session } = useAuth();
  const { hasProfile, status: profileStatus } = useProfile();
  const favorites = useFavorites();
  const demoFavoriteIds = USE_DEMO_DATA ? favorites.tripIds : null;
  const { revision } = useDiscovery();
  const userId = session?.user.id ?? '';
  const key = 'discovery:3:' + JSON.stringify(discoveryFiltersPayload(filters));
  const ready =
    USE_DEMO_DATA || (!!userId && hasProfile && profileStatus === 'ready');
  const store = useMemo(
    () =>
      createTripSearchStore(
        async (cursor?: TripSearchCursor, signal?: AbortSignal) => {
          if (!USE_DEMO_DATA)
            return fetchTripPage(
              userId,
              filters,
              cursor,
              pageSize,
              signal,
            );
          const sorted = filterProposals(
            DEMO_PROPOSALS, filters, undefined, favorites.tripIds,
          ).sort((a, b) => (b.trip.publishedAt ?? '').localeCompare(a.trip.publishedAt ?? '')
            || a.trip.id.localeCompare(b.trip.id));
          const offset = cursor
            ? sorted.findIndex((item) => item.trip.id === cursor.id) + 1
            : 0;
          const page = sorted.slice(offset, offset + pageSize);
          const last = page.at(-1);
          return {
            items: page,
            totalCount: sorted.length,
            hasMore: offset + page.length < sorted.length,
            cursor: last
              ? {
                  id: last.trip.id,
                  published_at: last.trip.publishedAt ?? '',
                  version: 3,
                  query_key: key,
                }
              : null,
          };
        },
        pageSize,
        USE_DEMO_DATA
          ? undefined
          : (items, signal) =>
              refreshTripResults(
                userId,
                items.map((item) => item.trip.id),
                filters,
                signal,
              ),
      ),
    // Serialized filters and mutation revisions define the resource identity.
    // Hydration updates the cache without resetting already viewed pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      userId,
      key,
      pageSize,
      demoFavoriteIds,
    ],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const returnStore = useRef<typeof store | null>(null);
  const preserveOnReturn = useCallback(() => {
    returnStore.current = store;
  }, [store]);
  const favoritesRevision = filters.favoritesOnly ? favorites.tripIds : null;
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !ready) return;
      const restore = returnStore.current === store;
      returnStore.current = null;
      void (restore ? store.refresh() : store.restart());
      const sync = () => {
        if (Platform.OS !== 'web' || document.visibilityState === 'visible')
          void store.refresh();
      };
      const native = AppState.addEventListener('change', (value) => {
        if (value === 'active') sync();
      });
      if (Platform.OS === 'web')
        window.addEventListener('visibilitychange', sync);
      return () => {
        store.stop();
        native.remove();
        if (Platform.OS === 'web')
          window.removeEventListener('visibilitychange', sync);
      };
      // These revisions explicitly invalidate the current server results.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, enabled, ready, revision, favoritesRevision]),
  );
  return {
    ...state,
    refresh: store.refresh,
    loadMore: store.more,
    retry: store.retry,
    preserveOnReturn,
  };
}

export function useTripResultCount(filters: DiscoveryFilters, enabled = true) {
  const { session } = useAuth();
  const { hasProfile, status } = useProfile();
  const { revision } = useDiscovery();
  const favorites = useFavorites();
  const key = 'discovery:3:' + JSON.stringify(discoveryFiltersPayload(filters));
  const userId = session?.user.id ?? '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    count: number | null;
    error: boolean;
  }>({ key: '', count: null, error: false });
  const requestKey = userId + key;
  useEffect(() => {
    if (
      USE_DEMO_DATA ||
      !enabled ||
      !userId ||
      !hasProfile ||
      status !== 'ready'
    )
      return;
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ key: requestKey, count: null, error: false });
      void fetchTripCount(userId, filters, controller.signal)
        .then((count) => {
          if (current) setResult({ key: requestKey, count, error: false });
        })
        .catch(() => {
          if (current) setResult({ key: requestKey, count: null, error: true });
        });
    }, 250);
    return () => {
      current = false;
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    requestKey,
    enabled,
    userId,
    hasProfile,
    status,
    attempt,
    revision,
    favorites.tripIds,
  ]);
  return {
    count: !enabled
      ? null
      : USE_DEMO_DATA
        ? filterProposals(DEMO_PROPOSALS, filters, undefined, favorites.tripIds)
            .length
        : result.key === requestKey
          ? result.count
          : null,
    countError:
      enabled && !USE_DEMO_DATA && result.key === requestKey && result.error,
    retryCount: () => setAttempt((value) => value + 1),
  };
}

export function useDiscoveryTrip(id: string) {
  const { session } = useAuth();
  const { revision } = useDiscovery();
  const userId = session?.user.id ?? '';
  const key = 'discovery:3:' + userId + ':' + id;
  const [result, setResult] = useState<{
    key: string;
    item: DiscoveryTripProposal | null;
    status: 'loading' | 'ready' | 'error';
    error: string | null;
  }>({ key: '', item: null, status: 'loading', error: null });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      const controller = new AbortController();
      if (!USE_DEMO_DATA && !userId) return;
      setResult({ key, item: null, status: 'loading', error: null });
      const demo = DEMO_PROPOSALS.find((p) => p.trip.id === id);
      const request = USE_DEMO_DATA
        ? Promise.resolve(demo ?? null)
        : fetchDiscoveryTrip(userId, id, controller.signal);
      void request
        .then((item) => {
          if (current) setResult({ key, item, status: 'ready', error: null });
        })
        .catch((e) => {
          if (current)
            setResult({
              key,
              item: null,
              status: 'error',
              error: discoveryError(e),
            });
        });
      return () => {
        current = false;
        controller.abort();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, userId, id, revision, attempt]),
  );
  return {
    item: result.key === key ? result.item : null,
    status: result.key === key ? result.status : ('loading' as const),
    error: result.key === key ? result.error : null,
    refresh: () => setAttempt((value) => value + 1),
  };
}
