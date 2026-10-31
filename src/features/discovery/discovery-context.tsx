import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { DiscoveryFilters } from '@/types/travel';
import { INITIAL_FILTERS } from './filter-trips';
import { INITIAL_GROUP_FILTERS, type GroupFilters } from '../groups/group-data';

interface DiscoveryState {
  filters: DiscoveryFilters;
  setFilters: Dispatch<SetStateAction<DiscoveryFilters>>;
  groupFilters: GroupFilters;
  setGroupFilters: Dispatch<SetStateAction<GroupFilters>>;
  revision: number;
  refresh: () => Promise<void>;
}
const DiscoveryContext = createContext<DiscoveryState | null>(null);
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DiscoveryFilters>(INITIAL_FILTERS);
  const [groupFilters, setGroupFilters] = useState(INITIAL_GROUP_FILTERS);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => { setRevision(value => value + 1); }, []);
  return (
    <DiscoveryContext value={{ filters, setFilters, groupFilters, setGroupFilters, revision, refresh }}>
      {children}
    </DiscoveryContext>
  );
}
export function useDiscovery() {
  const state = useContext(DiscoveryContext);
  if (!state) throw new Error('DiscoveryProvider is required');
  return state;
}
