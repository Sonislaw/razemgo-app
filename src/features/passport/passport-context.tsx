import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { accountIsActive, useAccountSyncJob } from '@/features/auth/account-sync-context';
import { useProfile } from '@/features/profile/profile-context';
import { PASSPORT_ENABLED } from './passport-config';
import { createPassportStore } from './passport-store';
import { fetchTravelerPassport } from './passport-repository';
import { demoPassport } from './passport-demo';

type Store = ReturnType<typeof createPassportStore>;
const PassportContext = createContext<{ store: Store; groupId: string; groupName: string; ready: boolean } | null>(null);
const noSubscription = () => () => undefined;
const emptyState = { data: null, status: 'loading' as const, error: null, newAward: null };
const emptySnapshot = () => emptyState;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });

export function PassportProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { profile, hasProfile, status } = useProfile();
  const groupId = profile.group.id, userId = session?.user.id ?? '';
  const ready = PASSPORT_ENABLED && hasProfile && status === 'ready' &&
    (USE_DEMO_DATA || (!!userId && !isLoading && !isRecovering && !error));
  const store = useMemo(() => createPassportStore(signal => USE_DEMO_DATA ? Promise.resolve(demoPassport(groupId)) :
    fetchTravelerPassport(userId, groupId, true, signal)), [userId, groupId]);
  const day = useRef('');
  const refresh = useCallback(async () => {
    const date = today();
    const result = await store.refresh();
    if (result) day.current = date;
    return result;
  }, [store]);
  useAccountSyncJob('passport', refresh, ready && !USE_DEMO_DATA);
  useEffect(() => {
    if (!ready) return;
    store.start();
    day.current = '';
    const foreground = () => { if (accountIsActive()) void refresh(); };
    foreground();
    const native = AppState.addEventListener('change', foreground);
    const timer = setInterval(() => { if (day.current !== today()) foreground(); }, 60000);
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', foreground);
      window.addEventListener('online', foreground);
    }
    return () => {
      clearInterval(timer); native.remove(); store.stop();
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', foreground);
        window.removeEventListener('online', foreground);
      }
    };
  }, [store, ready, refresh]);
  return <PassportContext value={{ store, groupId, groupName: profile.group.name, ready }}>{children}</PassportContext>;
}
export function useOwnPassport() {
  const context = useContext(PassportContext);
  const snapshot = useSyncExternalStore(context?.store.subscribe ?? noSubscription,
    context?.store.getSnapshot ?? emptySnapshot, context?.store.getSnapshot ?? emptySnapshot);
  return { ...snapshot, ready: !!context?.ready, groupId: context?.groupId,
    groupName: context?.groupName,
    refresh: context?.store.refresh, dismissAward: context?.store.dismissAward };
}
export function usePublicPassport(groupId: string, enabled: boolean) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const store = useMemo(() => createPassportStore(signal => USE_DEMO_DATA ? Promise.resolve(demoPassport(groupId, false)) :
    fetchTravelerPassport(userId, groupId, false, signal)), [userId, groupId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useFocusEffect(useCallback(() => {
    if (!enabled || !PASSPORT_ENABLED || (!userId && !USE_DEMO_DATA)) return;
    store.start(); void store.refresh();
    return store.stop;
  }, [store, userId, enabled]));
  return { ...state, refresh: store.refresh };
}
