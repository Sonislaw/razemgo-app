import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { DiscoveryFilters } from '@/types/travel';
import { INITIAL_FILTERS } from './filter-trips';
import { INITIAL_GROUP_FILTERS, type GroupFilters, type GroupSort } from '../groups/group-data';
import type { DiscoverySort } from './sort-proposals';

interface DiscoveryState {
  filters: DiscoveryFilters;
  setFilters: Dispatch<SetStateAction<DiscoveryFilters>>;
  sort: DiscoverySort;
  setSort: Dispatch<SetStateAction<DiscoverySort>>;
  groupFilters: GroupFilters;
  setGroupFilters: Dispatch<SetStateAction<GroupFilters>>;
  groupSort: GroupSort;
  setGroupSort: Dispatch<SetStateAction<GroupSort>>;
  revision: number;
  refresh: () => Promise<void>;
}
const DiscoveryContext = createContext<DiscoveryState | null>(null);
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DiscoveryFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<DiscoverySort>('default');
  const [groupFilters, setGroupFilters] = useState(INITIAL_GROUP_FILTERS);
  const [groupSort, setGroupSort] = useState<GroupSort>('compatibility');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => { setRevision(value => value + 1); }, []);
  return (
    <DiscoveryContext value={{ filters, setFilters, sort, setSort, groupFilters, setGroupFilters, groupSort, setGroupSort, revision, refresh }}>
      {children}
    </DiscoveryContext>
  );
}
export function useDiscovery() {
  const state = useContext(DiscoveryContext);
  if (!state) throw new Error('DiscoveryProvider is required');
  return state;
}
