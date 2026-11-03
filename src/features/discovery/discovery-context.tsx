import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { DiscoveryFilters } from '@/types/travel';
import { INITIAL_FILTERS } from './filter-trips';
import { INITIAL_GROUP_FILTERS, type GroupFilters } from '../groups/group-data';
import { useSavedFilters } from '../saved-filters/saved-filter-context';
import {
  copyFilterCriteria,
  sameFilterCriteria,
  type SavedFilterSet,
} from '../saved-filters/saved-filter-data';
import { tripDiscoveryReducer } from './trip-discovery-state';

interface DiscoveryState {
  filters: DiscoveryFilters;
  setFilters: Dispatch<SetStateAction<DiscoveryFilters>>;
  tripMapOpen: boolean;
  openTripMap: () => void;
  closeTripMap: () => void;
  groupFilters: GroupFilters;
  setGroupFilters: Dispatch<SetStateAction<GroupFilters>>;
  activeTripSet: SavedFilterSet | undefined;
  activeGroupSet: SavedFilterSet | undefined;
  applySavedFilterSet: (item: SavedFilterSet) => void;
  tripFilterRevision: number;
  revision: number;
  refresh: () => Promise<void>;
}
const DiscoveryContext = createContext<DiscoveryState | null>(null);
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [{ filters, mapOpen: tripMapOpen }, dispatchTrips] = useReducer(
    tripDiscoveryReducer,
    { filters: INITIAL_FILTERS, mapOpen: false },
  );
  const openTripMap = useCallback(
    () => dispatchTrips({ type: 'open-map' }),
    [],
  );
  const closeTripMap = useCallback(
    () => dispatchTrips({ type: 'close-map' }),
    [],
  );
  const [groupFilters, updateGroupFilters] = useState(INITIAL_GROUP_FILTERS);
  const [tripSetId, setTripSetId] = useState<string>();
  const [groupSetId, setGroupSetId] = useState<string>();
  const [tripFilterRevision, setTripFilterRevision] = useState(0);
  const { items } = useSavedFilters();
  const setFilters = useCallback<Dispatch<SetStateAction<DiscoveryFilters>>>(
    (value) => {
      setTripSetId(undefined);
      dispatchTrips({ type: 'filters', value });
    },
    [],
  );
  const setGroupFilters = useCallback<Dispatch<SetStateAction<GroupFilters>>>(
    (value) => {
      setGroupSetId(undefined);
      updateGroupFilters(value);
    },
    [],
  );
  const applySavedFilterSet = useCallback((item: SavedFilterSet) => {
    const draft = copyFilterCriteria(item);
    if (draft.kind === 'trips') {
      dispatchTrips({ type: 'filters', value: draft.filters });
      setTripSetId(item.id);
      setTripFilterRevision((value) => value + 1);
    } else {
      updateGroupFilters(draft.filters);
      setGroupSetId(item.id);
    }
  }, []);
  // Catalog synchronization never writes the active search. A changed or deleted
  // record only loses its label; the user's criteria remain an independent copy.
  const activeTripSet = items.find(
    (item) =>
      item.id === tripSetId &&
      sameFilterCriteria(item, { kind: 'trips', filters }),
  );
  const activeGroupSet = items.find(
    (item) =>
      item.id === groupSetId &&
      sameFilterCriteria(item, { kind: 'groups', filters: groupFilters }),
  );
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    setRevision((value) => value + 1);
  }, []);
  return (
    <DiscoveryContext
      value={{
        filters,
        setFilters,
        tripMapOpen,
        openTripMap,
        closeTripMap,
        groupFilters,
        setGroupFilters,
        activeTripSet,
        activeGroupSet,
        applySavedFilterSet,
        tripFilterRevision,
        revision,
        refresh,
      }}
    >
      {children}
    </DiscoveryContext>
  );
}
export function useDiscovery() {
  const state = useContext(DiscoveryContext);
  if (!state) throw new Error('DiscoveryProvider is required');
  return state;
}
