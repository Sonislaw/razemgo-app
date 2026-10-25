import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { createPresenceController, PRESENCE_POLL_MS, registerPresenceStop, type PresenceController } from './presence-controller';
import { getOnlineGroups, setPresence } from './presence-repository';

const PresenceContext = createContext<PresenceController | null>(null);
const EMPTY: ReadonlySet<string> = new Set();
const emptySnapshot = () => EMPTY;
const noSubscription = () => () => undefined;

export function isPresenceActive() {
  return Platform.OS === 'web'
    ? typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine
    : AppState.currentState === 'active';
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { profile, hasProfile, status } = useProfile();
  const userId = session?.user.id, groupId = profile.group.id;
  const ready = !USE_DEMO_DATA && !!userId && !isLoading && !isRecovering && !error && hasProfile && status === 'ready';
  const controller = useMemo(() => ready && userId ? createPresenceController(groupId, {
    newConnection: () => Crypto.randomUUID(),
    setPresence: (id, online) => setPresence(userId, id, online),
    getOnline: ids => getOnlineGroups(userId, ids),
  }) : null, [ready, userId, groupId]);
  useEffect(() => {
    if (!controller) return;
    const isActive = isPresenceActive;
    const sync = () => { if (isActive()) controller.start(); else void controller.stop(); };
    const native = Platform.OS !== 'web' ? AppState.addEventListener('change', sync) : null;
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', sync);
      window.addEventListener('online', sync);
      window.addEventListener('offline', sync);
      window.addEventListener('pagehide', controller.stop);
      window.addEventListener('pageshow', sync);
    }
    const unregister = registerPresenceStop(controller.stop, sync);
    const interval = setInterval(() => { if (isActive()) void controller.refresh(); }, PRESENCE_POLL_MS);
    sync();
    return () => {
      unregister(); clearInterval(interval); native?.remove();
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', sync);
        window.removeEventListener('online', sync);
        window.removeEventListener('offline', sync);
        window.removeEventListener('pagehide', controller.stop);
        window.removeEventListener('pageshow', sync);
      }
      void controller.stop();
    };
  }, [controller]);
  return <PresenceContext value={controller}>{children}</PresenceContext>;
}

export function useGroupOnline(groupId?: string) {
  const controller = useContext(PresenceContext);
  useEffect(() => groupId ? controller?.watch(groupId) : undefined, [controller, groupId]);
  const online = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return !!groupId && online.has(groupId);
}
