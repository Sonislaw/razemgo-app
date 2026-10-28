import { USE_DEMO_DATA } from '@/constants/app';
import {
  useAccountSync,
  useAccountSyncJob,
} from '@/features/auth/account-sync-context';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as repository from './notification-repository';
import { markNotificationsRead } from './notification-state';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationEntry,
  type NotificationPreferenceKey,
  type NotificationPreferences,
  type NotificationsPage,
} from './notification-types';

interface NotificationsContextValue {
  readKeys: string[];
  markRead: (keys: string[]) => void;
  items: NotificationEntry[];
  unreadCount: number;
  preferences: NotificationPreferences;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  actionError: string | null;
  busy: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  unreadOnly: boolean;
  setUnreadOnly: (value: boolean) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  read: (ids: string[]) => Promise<boolean>;
  readAll: () => Promise<boolean>;
  savePreference: (
    key: NotificationPreferenceKey,
    enabled: boolean,
  ) => Promise<boolean>;
}
const Context = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { hasProfile, status: profileStatus } = useProfile();
  const accountSync = useAccountSync();
  const userId = session?.user.id;
  const ready = !!userId && hasProfile && profileStatus === 'ready';
  const [readKeys, markRead] = useReducer(markNotificationsRead, []);
  const [page, setPage] = useState<NotificationsPage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const filter = useRef(unreadOnly);
  const current = useRef(page);
  const alive = useRef(true);
  const version = useRef(0);
  const fetching = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const lastRefreshSucceeded = useRef(false);
  const refreshLatest = useRef<() => Promise<void>>(async () => {});
  const mutating = useRef(false);
  const more = useRef(false);
  const request = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    version.current++;
    request.current?.abort();
  }, []);
  useEffect(() => {
    current.current = page;
  }, [page]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);

  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA || !ready || !alive.current) return;
    if (fetching.current) {
      again.current = true;
      return fetching.current;
    }
    if (!current.current) setStatus('loading');
    const pending = (async () => {
      try {
        do {
          again.current = false;
          const requestVersion = version.current;
          const mode = filter.current;
          const controller = new AbortController();
          request.current = controller;
          let data = await repository.fetchNotifications(
            mode,
            undefined,
            controller.signal,
          );
          const cached = current.current;
          if (cached && cached.items.length > 30) {
            const states = await repository.fetchNotificationStates(
              cached.items.map((item) => item.id),
              controller.signal,
            );
            const retained = cached.items.flatMap((item) =>
              states.has(item.id) && (!mode || !states.get(item.id))
                ? [{ ...item, read_at: states.get(item.id)! }]
                : [],
            );
            const merged = [
              ...new Map(
                [...retained, ...data.items].map((item) => [item.id, item]),
              ).values(),
            ].sort(
              (a, b) =>
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
            );
            data = { ...data, items: merged, has_more: cached.has_more };
          }
          if (!alive.current) return;
          if (requestVersion === version.current && mode === filter.current) {
            current.current = data;
            setPage(data);
            setStatus('ready');
            setError(null);
            lastRefreshSucceeded.current = true;
          }
        } while (again.current);
      } catch {
        if (alive.current) {
          if (!request.current?.signal.aborted) {
            lastRefreshSucceeded.current = false;
            accountSync?.retryOnPoll('notifications');
            if (!current.current) setStatus('error');
            setError(
              'Nie udało się wczytać powiadomień. Sprawdź połączenie i spróbuj ponownie.',
            );
          }
        }
      } finally {
        fetching.current = null;
        if (again.current && alive.current) {
          again.current = false;
          void refreshLatest.current();
        }
      }
    })();
    fetching.current = pending;
    return pending;
  }, [ready, accountSync]);
  useEffect(() => {
    refreshLatest.current = refresh;
  }, [refresh]);
  const changeUnreadOnly = (value: boolean) => {
    if (value === filter.current) return;
    filter.current = value;
    invalidate();
    current.current = null;
    setPage(null);
    setUnreadOnly(value);
    void refresh();
  };
  const synchronize = useCallback(async () => { await refresh(); return lastRefreshSucceeded.current; }, [refresh]);
  useAccountSyncJob('notifications', synchronize, ready);

  const loadMore = async () => {
    if (fetching.current) await fetching.current;
    const previous = current.current;
    if (!ready || !previous?.has_more || more.current) return;
    const cursor = previous.items.at(-1);
    if (!cursor) return;
    more.current = true;
    setLoadingMore(true);
    const requestVersion = version.current;
    try {
      const data = await repository.fetchNotifications(unreadOnly, cursor);
      if (
        alive.current &&
        version.current === requestVersion &&
        current.current === previous
      ) {
        const ids = new Set(previous.items.map((item) => item.id));
        const next = {
          ...data,
          fetched_at: previous.fetched_at,
          items: [
            ...previous.items,
            ...data.items.filter((item) => !ids.has(item.id)),
          ],
        };
        current.current = next;
        setPage(next);
        setError(null);
      }
    } catch {
      if (alive.current)
        setError(
          'Nie udało się wczytać starszych powiadomień. Spróbuj ponownie.',
        );
    } finally {
      more.current = false;
      if (alive.current) setLoadingMore(false);
    }
  };
  const perform = async (operation: () => Promise<void>) => {
    if (!ready || mutating.current || !alive.current) return false;
    mutating.current = true;
    version.current++;
    setBusy(true);
    setActionError(null);
    try {
      await operation();
      if (!alive.current) return false;
      version.current++;
      accountSync?.invalidate('event');
      return true;
    } catch {
      if (alive.current)
        setActionError(
          'Nie udało się zapisać zmiany. Sprawdź połączenie i spróbuj ponownie.',
        );
      return false;
    } finally {
      mutating.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const read = (ids: string[]) =>
    perform(() => repository.persistNotificationRead(ids));
  const readAll = () =>
    perform(() =>
      repository.persistNotificationRead(null, current.current?.fetched_at),
    );
  const savePreference = (key: NotificationPreferenceKey, enabled: boolean) =>
    perform(async () => {
      const preferences = await repository.persistNotificationPreference(
        key,
        enabled,
      );
      if (alive.current)
        setPage((previous) =>
          previous ? { ...previous, preferences } : previous,
        );
    });
  return (
    <Context
      value={{
        readKeys,
        markRead,
        items: page?.items ?? [],
        unreadCount: page?.unread_count ?? 0,
        preferences: page?.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
        status,
        error,
        actionError,
        busy,
        loadingMore,
        hasMore: page?.has_more ?? false,
        unreadOnly,
        setUnreadOnly: changeUnreadOnly,
        refresh,
        loadMore,
        read,
        readAll,
        savePreference,
      }}
    >
      {children}
    </Context>
  );
}
export function useNotifications() {
  const context = useContext(Context);
  if (!context) throw new Error('NotificationsProvider is required');
  return context;
}
