import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { isPresenceActive } from '@/features/presence/presence-context';
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
import { AppState, Platform } from 'react-native';
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
    const refresh = () => {
      if (isPresenceActive()) void store.refresh();
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    const foreground = AppState.addEventListener('change', refresh);
    if (Platform.OS === 'web')
      document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      foreground.remove();
      store.dispose();
      if (Platform.OS === 'web')
        document.removeEventListener('visibilitychange', refresh);
    };
  }, [store]);
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
const EMPTY_STORE = { subscribe: noSubscription, getSnapshot: emptySnapshot };
export function useFavorite(kind: FavoriteKind, id: string) {
  const store = useContext(FavoritesContext);
  const selection = useStoreSelector(store ?? EMPTY_STORE, (value) => ({
    selected: (kind === 'group' ? value.groupIds : value.tripIds).has(id),
    pending: value.busy.has(favoriteKey(kind, id)),
    status: value.status,
  }));
  return { ...selection, store };
}
