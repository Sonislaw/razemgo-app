import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useAccountSyncJob } from '@/features/auth/account-sync-context';
import { useProfile } from '@/features/profile/profile-context';
import { useStoreSelector } from '@/hooks/use-store-selector';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { fetchFavorites, saveFavorite } from './favorites-repository';
import {
  createFavoritesStore,
  favoriteKey,
  type FavoriteKind,
  type FavoritesSnapshot,
  type FavoritesStore,
  type FavoritesTransport,
} from './favorites-store';

const FavoritesContext = createContext<FavoritesStore | null>(null);
const EMPTY: FavoritesSnapshot = {
  groupIds: new Set(),
  tripIds: new Set(),
  busy: new Set(),
  status: 'ready',
  error: null,
  revision: 0,
};
const emptySnapshot = () => EMPTY;
const noSubscription = () => () => undefined;
const noopRefresh = () => Promise.resolve();
function demoTransport(): FavoritesTransport {
  const groups = new Set<string>(),
    trips = new Set<string>();
  return {
    load: async () => ({ group_ids: [...groups], trip_ids: [...trips] }),
    save: async (kind, id, selected) => {
      const target = kind === 'group' ? groups : trips;
      if (selected) target.add(id);
      else target.delete(id);
      return selected;
    },
  };
}
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { hasProfile, status } = useProfile();
  const userId = session?.user.id;
  const ready =
    USE_DEMO_DATA ||
    (!!userId &&
      !isLoading &&
      !isRecovering &&
      !error &&
      hasProfile &&
      status === 'ready');
  const store = useMemo(
    () =>
      ready
        ? createFavoritesStore(
            USE_DEMO_DATA
              ? demoTransport()
              : {
                  load: () => fetchFavorites(userId!),
                  save: (kind, id, selected) =>
                    saveFavorite(userId!, kind, id, selected),
                },
          )
        : null,
    // Identity changes always create an empty store; no previous-account cache is reused.
    [ready, userId],
  );
  useEffect(() => {
    if (!store) return;
    store.activate();
    if (USE_DEMO_DATA) void store.refresh();
    return () => {
      store.dispose();
    };
  }, [store]);
  useAccountSyncJob(
    'favorites',
    async () => {
      await store?.refresh();
      const snapshot = store?.getSnapshot();
      return snapshot?.status === 'ready' && !snapshot.error;
    },
    !!store && !USE_DEMO_DATA,
  );
  return <FavoritesContext value={store}>{children}</FavoritesContext>;
}
export function useFavorites() {
  const store = useContext(FavoritesContext);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return { ...snapshot, store, refresh: store?.refresh ?? noopRefresh };
}
export function useFavoritesStore() {
  return useContext(FavoritesContext);
}
const EMPTY_STORE = { subscribe: noSubscription, getSnapshot: emptySnapshot };
export function useFavoriteIds(kind: FavoriteKind, enabled = true) {
  const store = useContext(FavoritesContext);
  return useStoreSelector(
    store ?? EMPTY_STORE,
    (value) =>
      enabled
        ? kind === 'group'
          ? value.groupIds
          : value.tripIds
        : EMPTY.tripIds,
    (a, b) => a === b,
  );
}
export function useFavorite(kind: FavoriteKind, id: string) {
  const store = useContext(FavoritesContext);
  const selection = useStoreSelector(store ?? EMPTY_STORE, (value) => ({
    selected: (kind === 'group' ? value.groupIds : value.tripIds).has(id),
    pending: value.busy.has(favoriteKey(kind, id)),
    status: value.status,
  }));
  return { ...selection, store };
}
