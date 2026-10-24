import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import { AppState } from 'react-native';
import type { DiscoveryFilters, TripProposal } from '@/types/travel';
import { USE_DEMO_DATA } from '@/constants/app';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { todayDate } from '@/features/trips/own-trips-state';
import { INITIAL_FILTERS } from './filter-trips';
import type { DiscoverySort } from './sort-proposals';
import { fetchPublicTrips } from './discovery-repository';
import { tripCompatibility, type Compatibility } from './compatibility';

interface DiscoveryState {
  filters: DiscoveryFilters;
  setFilters: Dispatch<SetStateAction<DiscoveryFilters>>;
  sort: DiscoverySort;
  setSort: Dispatch<SetStateAction<DiscoverySort>>;
  proposals: TripProposal[];
  compatibility: Record<string, Compatibility>;
  status: 'loading' | 'ready' | 'error';
  hasLoaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
const DiscoveryContext = createContext<DiscoveryState | null>(null);
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DiscoveryFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<DiscoverySort>('default');
  const [proposals, setProposals] = useState<TripProposal[]>(USE_DEMO_DATA ? DEMO_PROPOSALS : []);
  const [status, setStatus] = useState<DiscoveryState['status']>(USE_DEMO_DATA ? 'ready' : 'loading');
  const [hasLoaded, setHasLoaded] = useState(USE_DEMO_DATA);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const { profile, hasProfile, status: profileStatus } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const userId = session?.user.id;
  const alive = useRef(true);
  const pending = useRef<Promise<void> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA || !userId || !hasProfile || profileStatus !== 'ready') return;
    if (pending.current) return pending.current;
    setStatus('loading');
    setError(null);
    const request = (async () => {
      try {
        const loaded = await fetchPublicTrips();
        if (!alive.current) return;
        setProposals(loaded);
        setStatus('ready');
        setHasLoaded(true);
      } catch {
        if (!alive.current) return;
        setStatus('error');
        setError('Nie udało się pobrać ogłoszeń. Sprawdź połączenie i spróbuj ponownie.');
      } finally { pending.current = null; }
    })();
    pending.current = request;
    return request;
  }, [userId, hasProfile, profileStatus]);
  useEffect(() => { void refresh(); }, [refresh, ownTrips.revision]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  const compatibility = useMemo(() => Object.fromEntries(proposals.map(proposal => [
    proposal.trip.id, tripCompatibility(proposal, profile, ownTrips.trips, filters, todayDate()),
  ])), [proposals, profile, ownTrips.trips, filters]);
  return (
    <DiscoveryContext value={{ filters, setFilters, sort, setSort, proposals, compatibility, status, hasLoaded, error, refresh }}>
      {children}
    </DiscoveryContext>
  );
}
export function useDiscovery() {
  const state = useContext(DiscoveryContext);
  if (!state) throw new Error('DiscoveryProvider is required');
  return state;
}
