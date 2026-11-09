import type { DiscoveryFilters } from '../../types/travel';

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
    return { mapOpen: true, filters: plannedMapFilters(state.filters) };
  if (action.type === 'close-map') return state.mapOpen ? {
    mapOpen: false,
    filters: { ...state.filters, tripModes: ['planned', 'flexible'] },
  } : state;
  const filters =
    typeof action.value === 'function'
      ? action.value(state.filters)
      : action.value;
  return {
    ...state,
    filters: state.mapOpen ? plannedMapFilters(filters) : filters,
  };
}
