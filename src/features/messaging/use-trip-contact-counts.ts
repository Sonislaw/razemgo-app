import { USE_DEMO_DATA } from '@/constants/app';
import { integer, object } from '@/data/contracts/validate';
import { useAccountSummary } from '@/features/auth/account-sync-context';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export function useTripContactCounts(id: string) {
  const revision = useAccountSummary()?.revision;
  const [result, setResult] = useState<{
    id: string;
    contacts: number;
    pending: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0),
    [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (USE_DEMO_DATA || !id) return;
      const request = new AbortController();
      void backendRequest(
        (signal) =>
          getSupabase()
            .rpc('get_my_trip_contact_counts', { target_trip_id: id })
            .abortSignal(signal),
        'mailbox.load',
        { signal: request.signal },
      )
        .then(({ data, error }) => {
          if (error) throw error;
          const value = object(data);
          integer(value.contacts);
          integer(value.pending);
          if (!request.signal.aborted) {
            setResult({ id, contacts: value.contacts, pending: value.pending });
            setError(null);
          }
        })
        .catch(() => {
          if (!request.signal.aborted)
            setError(
              'Nie udało się odświeżyć liczby kontaktów. Spróbuj ponownie.',
            );
        });
      return () => request.abort();
      // Both a manual retry and the account revision invalidate this read.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, revision, attempt]),
  );
  return {
    counts: result?.id === id ? result : null,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
