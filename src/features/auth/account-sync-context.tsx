import { USE_DEMO_DATA } from '@/constants/app';
import type { AccountSummary } from '@/data/contracts/pages';
import { integer, object } from '@/data/contracts/validate';
import { useProfile } from '@/features/profile/profile-context';
import { createAccountSync } from '@/lib/account-sync';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from './auth-context';

type Sync = ReturnType<typeof createAccountSync>;
type Status = 'connecting' | 'live' | 'reconnecting';
const JobsContext = createContext<Sync | null>(null);
const StatusContext = createContext<Status>('connecting');
const SummaryContext = createContext<AccountSummary | null>(null);
export const accountIsActive = () =>
  AppState.currentState === 'active' &&
  (Platform.OS !== 'web' ||
    (document.visibilityState === 'visible' && navigator.onLine));

export function AccountSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { profile, hasProfile, status } = useProfile();
  const userId = session?.user.id;
  const groupId = profile.group.id;
  const ready = !USE_DEMO_DATA && !!userId && hasProfile && status === 'ready';
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const sync = useMemo(
    () =>
      ready
        ? createAccountSync(accountIsActive, async () => {
            const { data, error } = await backendRequest(
              (signal) =>
                getSupabase().rpc('get_my_sync_state').abortSignal(signal),
              'mailbox.load',
            );
            if (error) throw error;
            const value = object(data);
            for (const key of [
              'revision',
              'unread_messages',
              'pending_invitations',
              'unread_notifications',
              'active_trips',
              'archived_trips',
            ])
              integer(value[key]);
            setSummary((previous) =>
              JSON.stringify(previous) === JSON.stringify(data)
                ? previous
                : data,
            );
            return JSON.stringify(data);
          })
        : null,
    // Identity must replace the controller even when readiness stays true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, userId, groupId],
  );
  const [connection, setConnection] = useState<Status>('connecting');
  useEffect(() => {
    if (!sync) return;
    sync.activate();
    const client = getSupabase();
    const channel = client
      .channel('account-' + userId, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mailbox_updates',
          filter: 'group_id=eq.' + groupId,
        },
        () => sync.invalidate('event'),
      )
      .subscribe((value) => {
        if (value === 'SUBSCRIBED') {
          setConnection('live');
          sync.invalidate('event');
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(value))
          setConnection('reconnecting');
      });
    const foreground = () => {
      if (accountIsActive()) sync.invalidate('foreground');
    };
    const native = AppState.addEventListener('change', foreground);
    const timer = setInterval(() => sync.invalidate('poll'), 20000);
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', foreground);
      window.addEventListener('online', foreground);
    }
    return () => {
      clearInterval(timer);
      native.remove();
      sync.dispose();
      void client.removeChannel(channel);
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', foreground);
        window.removeEventListener('online', foreground);
      }
    };
  }, [sync, userId, groupId]);
  return (
    <JobsContext value={sync}>
      <StatusContext value={connection}>
        <SummaryContext value={summary}>{children}</SummaryContext>
      </StatusContext>
    </JobsContext>
  );
}

export function useAccountSync() {
  return useContext(JobsContext);
}
export function useAccountSyncStatus() {
  return useContext(StatusContext);
}
export function useAccountSummary() {
  return useContext(SummaryContext);
}
export function useAccountSyncJob(
  key: string,
  job: () => Promise<unknown>,
  enabled: boolean,
  periodic = true,
) {
  const sync = useAccountSync();
  const latest = useRef(job);
  useEffect(() => {
    latest.current = job;
  }, [job]);
  useEffect(
    () =>
      enabled
        ? sync?.register(key, () => latest.current(), periodic)
        : undefined,
    [sync, key, enabled, periodic],
  );
}
