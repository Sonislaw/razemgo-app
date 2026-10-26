import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { GROUP_TRIP_PAGE_SIZE, type GroupTripCursor, type PublicGroupPage } from './group-data';
import { DEMO_PUBLIC_GROUPS, withDemoGroupCompatibility } from './group-demo';
import { fetchPublicGroup } from './group-repository';
import { createGroupProfileStore } from './group-profile-store';

export function useGroupProfile(id: string) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user.id ?? '';
  const store = useMemo(() => createGroupProfileStore(async (cursor?: GroupTripCursor): Promise<PublicGroupPage | null> => {
    if (!USE_DEMO_DATA) return fetchPublicGroup(userId, id, cursor);
    const example = DEMO_PUBLIC_GROUPS.find(item => item.group.id === id);
    if (!example) return null;
    const data = withDemoGroupCompatibility(example, profile);
    const offset = cursor ? data.trips.findIndex(item => item.trip.id === cursor.id) + 1 : 0;
    const trips = data.trips.slice(offset, offset + GROUP_TRIP_PAGE_SIZE), last = trips.at(-1);
    return { ...data, trips, hasMore: offset + trips.length < data.trips.length,
      cursor: last ? { id: last.trip.id, published_at: last.trip.publishedAt ?? '', query_key: id } : null };
  }), [userId, id, profile]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const returnStore = useRef<typeof store | null>(null);
  const preserveOnReturn = useCallback(() => { returnStore.current = store; }, [store]);
  useFocusEffect(useCallback(() => {
    if (!USE_DEMO_DATA && !userId) return;
    const restore = returnStore.current === store;
    returnStore.current = null;
    void (restore ? store.refresh() : store.restart());
    return () => store.stop();
  }, [store, userId]));
  return { ...state, retry: store.retry, loadMore: store.more, preserveOnReturn };
}
