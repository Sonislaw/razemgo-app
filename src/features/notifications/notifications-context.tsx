import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { getSupabase } from '@/lib/supabase';
import { markNotificationsRead } from './notification-state';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationEntry, type NotificationPreferences, type NotificationsPage } from './notification-types';
import * as repository from './notification-repository';

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
  savePreference: (key: 'messages' | 'invitations', enabled: boolean) => Promise<boolean>;
}
const Context = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { profile, hasProfile, status: profileStatus } = useProfile();
  const userId = session?.user.id;
  const groupId = profile.group.id;
  const ready = !!userId && hasProfile && profileStatus === 'ready';
  const [readKeys, markRead] = useReducer(markNotificationsRead, []);
  const [page, setPage] = useState<NotificationsPage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
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
  const mutating = useRef(false);
  const more = useRef(false);
  const invalidate = useCallback(() => { version.current++; }, []);
  useEffect(() => { current.current = page; }, [page]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);

  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA || !ready || !alive.current) return;
    if (fetching.current) { again.current = true; return fetching.current; }
    if (!current.current) setStatus('loading');
    const pending = (async () => {
      try {
        do {
          again.current = false;
          const requestVersion = version.current;
          const mode = filter.current;
          let data = await repository.fetchNotifications(mode);
          // Keep already loaded history in place and refresh its read status on both devices.
          const count = current.current?.items.length ?? 30;
          while (data.has_more && data.items.length < count && requestVersion === version.current && alive.current) {
            const older = await repository.fetchNotifications(mode, data.items.at(-1));
            data = { ...data, items: [...data.items, ...older.items], has_more: older.has_more };
          }
          if (!alive.current) return;
          if (requestVersion === version.current && mode === filter.current) { current.current = data; setPage(data); setStatus('ready'); setError(null); }
        } while (again.current);
      } catch {
        if (alive.current) {
          if (!current.current) setStatus('error');
          setError('Nie udało się wczytać powiadomień. Sprawdź połączenie i spróbuj ponownie.');
        }
      } finally { fetching.current = null; }
    })();
    fetching.current = pending;
    return pending;
  }, [ready]);
  useEffect(() => { filter.current = unreadOnly; invalidate(); void refresh(); }, [refresh, unreadOnly, invalidate]);
  useEffect(() => {
    if (USE_DEMO_DATA || !ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const synchronize = () => { if (AppState.currentState === 'active') void refresh(); };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(synchronize, 150); };
    const client = getSupabase();
    const channel = client.channel('notifications-' + userId, { config: { postgres_changes_options: { wait: true } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mailbox_updates', filter: 'group_id=eq.' + groupId }, schedule)
      .subscribe(value => { if (value === 'SUBSCRIBED') schedule(); });
    const foreground = AppState.addEventListener('change', value => { if (value === 'active') synchronize(); });
    const interval = setInterval(synchronize, 20000);
    return () => { clearTimeout(timer); clearInterval(interval); foreground.remove(); void client.removeChannel(channel); };
  }, [ready, userId, groupId, refresh]);

  const loadMore = async () => {
    const previous = current.current;
    if (!ready || !previous?.has_more || more.current) return;
    const cursor = previous.items.at(-1);
    if (!cursor) return;
    more.current = true; setLoadingMore(true);
    const requestVersion = version.current;
    try {
      const data = await repository.fetchNotifications(unreadOnly, cursor);
      if (alive.current && version.current === requestVersion && current.current === previous) {
        const ids = new Set(previous.items.map(item => item.id));
        const next = { ...data, fetched_at: previous.fetched_at, items: [...previous.items, ...data.items.filter(item => !ids.has(item.id))] };
        current.current = next; setPage(next); setError(null);
      }
    } catch { if (alive.current) setError('Nie udało się wczytać starszych powiadomień. Spróbuj ponownie.'); }
    finally { more.current = false; if (alive.current) setLoadingMore(false); }
  };
  const perform = async (operation: () => Promise<void>) => {
    if (!ready || mutating.current || !alive.current) return false;
    mutating.current = true; version.current++; setBusy(true); setActionError(null);
    try {
      await operation();
      if (!alive.current) return false;
      version.current++;
      await refresh();
      return true;
    } catch {
      if (alive.current) setActionError('Nie udało się zapisać zmiany. Sprawdź połączenie i spróbuj ponownie.');
      return false;
    } finally { mutating.current = false; if (alive.current) setBusy(false); }
  };
  const read = (ids: string[]) => perform(() => repository.persistNotificationRead(ids));
  const readAll = () => perform(() => repository.persistNotificationRead(null, current.current?.fetched_at));
  const savePreference = (key: 'messages' | 'invitations', enabled: boolean) => perform(async () => {
    const preferences = await repository.persistNotificationPreference(key, enabled);
    if (alive.current) setPage(previous => previous ? { ...previous, preferences } : previous);
  });
  return <Context value={{ readKeys, markRead, items: page?.items ?? [], unreadCount: page?.unread_count ?? 0,
    preferences: page?.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES, status, error, actionError,
    busy, loadingMore, hasMore: page?.has_more ?? false, unreadOnly, setUnreadOnly,
    refresh, loadMore, read, readAll, savePreference }}>{children}</Context>;
}
export function useNotifications() {
  const context = useContext(Context);
  if (!context) throw new Error('NotificationsProvider is required');
  return context;
}
