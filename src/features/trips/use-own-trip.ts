import { USE_DEMO_DATA } from '@/constants/app';
import type { OwnTripCursor } from '@/data/contracts/pages';
import { useAuth } from '@/features/auth/auth-context';
import { backendRequest } from '@/lib/backend-request';
import { createPagedResource } from '@/lib/paged-resource';
import { getSupabase } from '@/lib/supabase';
import type { OwnedTrip, OwnTripFilters } from '@/types/owned-trip';
import { useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useOwnTrips } from './own-trips-context';
import { isArchivedTrip, selectOwnTrips, todayDate } from './own-trips-state';
import { tripFromRow } from './trip-mapper';
import { fetchOwnTrip, fetchOwnTripPage } from './trip-repository';

export function useOwnTrip(id?: string) {
  const { state, cacheTrips, forgetTrip } = useOwnTrips();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [result, setResult] = useState<{
    id?: string;
    status: 'loading' | 'ready' | 'error';
    missing?: boolean;
  }>({ status: 'loading' });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!id || USE_DEMO_DATA || !userId) return;
    const controller = new AbortController();
    void fetchOwnTrip(id, controller.signal)
      .then((trip) => {
        if (controller.signal.aborted) return;
        if (trip) cacheTrips([trip]);
        else forgetTrip(id);
        setResult({ id, status: 'ready', missing: !trip });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ id, status: 'error' });
      });
    return () => controller.abort();
  }, [id, userId, cacheTrips, forgetTrip, attempt]);
  const trip = state.trips.find((trip) => trip.id === id);
  return {
    trip: result.id === id && result.missing ? undefined : trip,
    status:
      !id || USE_DEMO_DATA
        ? ('ready' as const)
        : result.id === id
          ? result.status
          : ('loading' as const),
    error:
      result.id === id && result.status === 'error'
        ? 'Nie udało się pobrać wyjazdu. Spróbuj ponownie.'
        : null,
    retry: () => retry((value) => value + 1),
  };
}

export function useOwnTripListing(filters: OwnTripFilters, archived: boolean) {
  const { state, cacheTrips } = useOwnTrips();
  const { session } = useAuth();
  const referenceDay = todayDate();
  const key = JSON.stringify({ filters, referenceDay });
  const store = useMemo(
    () =>
      createPagedResource({
        load: async (
          cursor: OwnTripCursor | undefined,
          signal: AbortSignal,
        ) => {
          if (USE_DEMO_DATA) {
            const all = selectOwnTrips(
              state.trips,
              filters,
              archived,
              todayDate(),
            );
            const offset = cursor
                ? all.findIndex((item) => item.id === cursor.id) + 1
                : 0,
              items = all.slice(offset, offset + 20);
            return {
              items,
              totalCount: all.length,
              hasMore: offset + items.length < all.length,
              cursor: items.length
                ? { id: items.at(-1)!.id, sort_date: '', query_key: key }
                : null,
              activeCount: state.trips.filter(
                (trip) => !isArchivedTrip(trip, todayDate()),
              ).length,
              archivedCount: state.trips.filter((trip) =>
                isArchivedTrip(trip, todayDate()),
              ).length,
            };
          }
          const page = await fetchOwnTripPage(
            filters,
            archived,
            cursor,
            signal,
            referenceDay,
          );
          if (!signal.aborted) cacheTrips(page.items);
          return page;
        },
        key: (trip: OwnedTrip) => trip.id,
        error: () =>
          'Nie udało się pobrać wyjazdów. Sprawdź połączenie i spróbuj ponownie.',
        refreshItems: USE_DEMO_DATA
          ? undefined
          : async (items, signal) => {
              const loaded: OwnedTrip[] = [];
              for (let offset = 0; offset < items.length; offset += 100) {
                const { data, error } = await backendRequest(
                  (requestSignal) =>
                    getSupabase()
                      .from('trip_plans')
                      .select('*')
                      .in(
                        'id',
                        items
                          .slice(offset, offset + 100)
                          .map((item) => item.id),
                      )
                      .abortSignal(requestSignal),
                  'trips.load',
                  { signal },
                );
                if (error) throw error;
                loaded.push(...(data ?? []).map(tripFromRow));
              }
              if (!signal.aborted) cacheTrips(loaded);
              return selectOwnTrips(loaded, filters, archived, todayDate());
            },
      }),
    // Filter values use the normalized key; cache hydration must not replace the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.user.id, key, archived, state.revision, cacheTrips],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useFocusEffect(
    useCallback(() => {
      void store.refresh();
      return () => store.stop();
    }, [store]),
  );
  return {
    ...snapshot,
    items: snapshot.page?.items ?? [],
    activeCount: snapshot.page?.activeCount ?? 0,
    archivedCount: snapshot.page?.archivedCount ?? 0,
    totalCount: snapshot.page?.totalCount ?? 0,
    refresh: store.refresh,
    loadMore: store.more,
    retry: store.retry,
  };
}
