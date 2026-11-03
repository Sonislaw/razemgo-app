import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useAccountSyncJob } from '@/features/auth/account-sync-context';
import { useProfile } from '@/features/profile/profile-context';
import { fetchFilterSets, persistFilterSet, removeFilterSet } from './saved-filter-repository';
import { createSavedFilterStore, type SavedFilterSnapshot, type SavedFilterStore, type SavedFilterTransport } from './saved-filter-store';
import { filterSetPayload, parseSavedFilterSet, type SavedFilterSet } from './saved-filter-data';

const Context = createContext<SavedFilterStore | null>(null);
const EMPTY: SavedFilterSnapshot = { items: [], status: 'ready', error: null, busy: false };
const emptySnapshot = () => EMPTY;
const noSubscription = () => () => undefined;
function demoTransport(): SavedFilterTransport {
  let items: SavedFilterSet[] = [];
  return {
    load: async () => items,
    save: async request => {
      const old = items.find(item => item.id === request.id);
      if (!old && request.filters === null) throw Object.assign(Error(), { code: 'P0002' });
      const stamp = new Date().toISOString();
      const item = parseSavedFilterSet({ id: request.id, name: request.name, kind: request.kind,
        filters: request.filters ?? filterSetPayload(old!), schema_version: 1, created_at: old?.createdAt ?? stamp, updated_at: stamp });
      items = [...items.filter(value => value.id !== item.id), item]; return item;
    },
    remove: async id => { items = items.filter(item => item.id !== id); return true; },
  };
}
export function SavedFilterProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { hasProfile, status } = useProfile();
  const userId = session?.user.id;
  const ready = USE_DEMO_DATA || (!!userId && !isLoading && !isRecovering && !error && hasProfile && status === 'ready');
  const store = useMemo(() => ready ? createSavedFilterStore(USE_DEMO_DATA ? demoTransport() : {
    load: () => fetchFilterSets(userId!), save: request => persistFilterSet(userId!, request), remove: id => removeFilterSet(userId!, id),
  }) : null, [ready, userId]);
  useEffect(() => {
    if (!store) return;
    store.activate(); if (USE_DEMO_DATA) void store.refresh();
    return () => store.dispose();
  }, [store]);
  useAccountSyncJob('saved_filters', async () => {
    await store?.refresh(); const snapshot = store?.getSnapshot();
    return snapshot?.status === 'ready' && !snapshot.error;
  }, !!store && !USE_DEMO_DATA);
  return <Context value={store}>{children}</Context>;
}
export function useSavedFilters() {
  const store = useContext(Context);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return { ...snapshot, store };
}
