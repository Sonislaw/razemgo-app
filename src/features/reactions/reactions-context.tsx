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
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { fetchReactionSummaries, saveReaction } from './reactions-repository';
import {
  createReactionsStore,
  type ReactionsSnapshot,
  type ReactionsStore,
} from './reactions-store';

const Context = createContext<ReactionsStore | null>(null);
const EMPTY: ReactionsSnapshot = {
  items: new Map(),
  busy: new Set(),
  loading: new Set(),
  errors: new Map(),
};
const emptySnapshot = () => EMPTY;
const noSubscription = () => () => undefined;
export function ReactionsProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { hasProfile, status } = useProfile();
  const userId = session?.user.id;
  const ready =
    !USE_DEMO_DATA &&
    !!userId &&
    !isLoading &&
    !isRecovering &&
    !error &&
    hasProfile &&
    status === 'ready';
  const store = useMemo(
    () =>
      ready
        ? createReactionsStore({
            load: (ids) => fetchReactionSummaries(userId!, ids),
            save: (id, kind) => saveReaction(userId!, id, kind),
          })
        : null,
    [ready, userId],
  );
  useEffect(() => {
    if (!store) return;
    store.activate();
    const refresh = () => {
      if (isPresenceActive()) void store.refresh();
    };
    const timer = setInterval(refresh, 20000);
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
  return <Context value={store}>{children}</Context>;
}
export function useTripReactions(id: string) {
  const store = useContext(Context);
  const snapshot = useStoreSelector(
    store ?? { subscribe: noSubscription, getSnapshot: emptySnapshot },
    (value) => ({
      summary: value.items.get(id),
      busy: value.busy.has(id),
      loading: value.loading.has(id),
      error: value.errors.get(id),
    }),
  );
  useEffect(() => store?.watch(id), [id, store]);
  return { store, ...snapshot };
}
