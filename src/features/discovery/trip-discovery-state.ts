import type { DiscoveryFilters, TripMode } from '../../types/travel';
import { INITIAL_FILTERS } from './filter-trips.ts';

export function discoveryTripMode(filters: DiscoveryFilters): TripMode {
  return filters.tripModes.length === 1 && filters.tripModes[0] === 'planned'
    ? 'planned'
    : 'flexible';
}

// Older saved sets can contain both types. Keep the current tab for those sets,
// while single-type sets still select their original tab.
export function singleTripFilters(
  filters: DiscoveryFilters,
  fallback: TripMode = 'flexible',
): DiscoveryFilters {
  return filters.tripModes.length === 1
    ? filters
    : { ...filters, tripModes: [fallback] };
}

export function emptyDiscoveryFilters(mode: TripMode = 'flexible'): DiscoveryFilters {
  return { ...INITIAL_FILTERS, tripModes: [mode] };
}

export function plannedMapFilters(filters: DiscoveryFilters): DiscoveryFilters {
  return filters.tripModes.length === 1 && filters.tripModes[0] === 'planned'
    ? filters
    : { ...filters, tripModes: ['planned'] };
}

export function hasResettableMapFilters(filters: DiscoveryFilters): boolean {
  return Boolean(
    filters.favoritesOnly ||
      filters.dateRangeId !== 'all' ||
      filters.location.trim() ||
      filters.childAgeBands.length ||
      filters.groupKinds?.length ||
      filters.animalKinds?.length ||
      filters.landscapeKinds?.length,
  );
}

export interface TripDiscoveryState {
  filters: DiscoveryFilters;
  mapOpen: boolean;
  mapReturnMode?: TripMode;
}
type TripDiscoveryAction =
  | { type: 'open-map' }
  | { type: 'close-map' }
  | {
      type: 'filters';
      value:
        | DiscoveryFilters
        | ((current: DiscoveryFilters) => DiscoveryFilters);
    };

// Evaluate the lock when an action is processed, including callbacks created
// before the map opened (for example a delayed saved-set acknowledgement).
export function tripDiscoveryReducer(
  state: TripDiscoveryState,
  action: TripDiscoveryAction,
): TripDiscoveryState {
  if (action.type === 'open-map')
    return state.mapOpen ? state : {
      mapOpen: true,
      mapReturnMode: discoveryTripMode(state.filters),
      filters: plannedMapFilters(state.filters),
    };
  if (action.type === 'close-map') return state.mapOpen ? {
    mapOpen: false,
    filters: { ...state.filters, tripModes: [state.mapReturnMode ?? 'flexible'] },
  } : state;
  const filters =
    typeof action.value === 'function'
      ? action.value(state.filters)
      : action.value;
  return {
    ...state,
    filters: state.mapOpen
      ? plannedMapFilters(filters)
      : singleTripFilters(filters, discoveryTripMode(state.filters)),
  };
}
