import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { USE_DEMO_DATA } from '@/constants/app';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { useFavorites } from '@/features/favorites/favorites-context';
import { todayDate } from '@/features/trips/own-trips-state';
import type { DiscoveryFilters } from '@/types/travel';
import { tripCompatibility } from './compatibility';
import { discoveryError, discoveryFiltersPayload, TRIP_SEARCH_PAGE_SIZE, type RankedTripProposal, type TripSearchCursor } from './discovery-data';
import { filterProposals } from './filter-trips';
import { sortDiscoveryProposals, type DiscoverySort } from './sort-proposals';
import { createTripSearchStore } from './discovery-store';
import { fetchDiscoveryTrip, fetchTripCount, fetchTripPage } from './discovery-repository';
import { useDiscovery } from './discovery-context';

export function useTripSearch(filters: DiscoveryFilters, sort: DiscoverySort = 'default', pageSize = TRIP_SEARCH_PAGE_SIZE, enabled = true) {
  const { session } = useAuth();
  const { profile, hasProfile, status: profileStatus } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const favorites = useFavorites();
  const { revision } = useDiscovery();
  const userId = session?.user.id ?? '';
  const key = JSON.stringify(discoveryFiltersPayload(filters));
  const ready = USE_DEMO_DATA || (!!userId && hasProfile && profileStatus === 'ready');
  const store = useMemo(() => createTripSearchStore(async (cursor?: TripSearchCursor) => {
    if (!USE_DEMO_DATA) return fetchTripPage(userId, filters, sort, cursor, pageSize);
    const items = filterProposals(DEMO_PROPOSALS, filters, undefined, favorites.tripIds).map(proposal => ({ ...proposal,
      compatibility: tripCompatibility(proposal, profile, ownTrips.trips, filters, todayDate()),
    }));
    const sorted = sortDiscoveryProposals(items, sort, Object.fromEntries(items.map(p => [p.trip.id, p.compatibility.score]))) as RankedTripProposal[];
    const offset = cursor ? sorted.findIndex(item => item.trip.id === cursor.id) + 1 : 0;
    const page = sorted.slice(offset, offset + pageSize);
    const last = page.at(-1);
    return { items: page, totalCount: sorted.length, hasMore: offset + page.length < sorted.length,
      cursor: last ? { id: last.trip.id, published_at: last.trip.publishedAt ?? '', score: last.compatibility.score, sort, query_key: key } : null };
    // The normalized payload is the filter identity; equivalent objects share a store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, pageSize), [userId, key, sort, pageSize, profile, ownTrips.revision, USE_DEMO_DATA ? favorites.tripIds : null]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const favoritesRevision = filters.favoritesOnly ? favorites.tripIds : null;
  useFocusEffect(useCallback(() => {
    if (!enabled || !ready) return;
    void store.refresh();
    const sync = () => { if (Platform.OS !== 'web' || document.visibilityState === 'visible') void store.refresh(); };
    const native = AppState.addEventListener('change', value => { if (value === 'active') sync(); });
    if (Platform.OS === 'web') window.addEventListener('visibilitychange', sync);
    return () => { store.stop(); native.remove(); if (Platform.OS === 'web') window.removeEventListener('visibilitychange', sync); };
    // These revisions explicitly invalidate the current server results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, enabled, ready, revision, favoritesRevision]));
  return { ...state, refresh: store.refresh, loadMore: store.more, retry: store.retry };
}

export function useTripResultCount(filters: DiscoveryFilters, enabled = true) {
  const { session } = useAuth();
  const { profile, hasProfile, status } = useProfile();
  const { revision } = useDiscovery();
  const favorites = useFavorites();
  const key = JSON.stringify(discoveryFiltersPayload(filters));
  const userId = session?.user.id ?? '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; count: number | null; error: boolean }>({ key: '', count: null, error: false });
  const requestKey = userId + key;
  useEffect(() => {
    if (USE_DEMO_DATA || !enabled || !userId || !hasProfile || status !== 'ready') return;
    let current = true;
    const timer = setTimeout(() => {
      setResult({ key: requestKey, count: null, error: false });
      void fetchTripCount(userId, filters).then(count => { if (current) setResult({ key: requestKey, count, error: false }); })
        .catch(() => { if (current) setResult({ key: requestKey, count: null, error: true }); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, userId, hasProfile, status, attempt, revision, favorites.tripIds, profile]);
  return { count: !enabled ? null : USE_DEMO_DATA ? filterProposals(DEMO_PROPOSALS, filters, undefined, favorites.tripIds).length
    : result.key === requestKey ? result.count : null,
    countError: enabled && !USE_DEMO_DATA && result.key === requestKey && result.error,
    retryCount: () => setAttempt(value => value + 1) };
}

export function useDiscoveryTrip(id: string, filters: DiscoveryFilters) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const { revision } = useDiscovery();
  const userId = session?.user.id ?? '';
  const key = userId + id + JSON.stringify(discoveryFiltersPayload(filters));
  const [result, setResult] = useState<{ key: string; item: RankedTripProposal | null; status: 'loading' | 'ready' | 'error'; error: string | null }>({ key: '', item: null, status: 'loading', error: null });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let current = true;
    if (!USE_DEMO_DATA && !userId) return;
    setResult({ key, item: null, status: 'loading', error: null });
    const demo = DEMO_PROPOSALS.find(p => p.trip.id === id);
    const request = USE_DEMO_DATA ? Promise.resolve(demo ? { ...demo, compatibility: tripCompatibility(demo, profile, ownTrips.trips, filters, todayDate()) } : null)
      : fetchDiscoveryTrip(userId, id, filters);
    void request.then(item => { if (current) setResult({ key, item, status: 'ready', error: null }); })
      .catch(e => { if (current) setResult({ key, item: null, status: 'error', error: discoveryError(e) }); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId, id, profile, ownTrips.revision, revision, attempt]));
  return { item: result.key === key ? result.item : null, status: result.key === key ? result.status : 'loading' as const,
    error: result.key === key ? result.error : null, refresh: () => setAttempt(value => value + 1) };
}
