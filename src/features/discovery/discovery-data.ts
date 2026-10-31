import type { DiscoveryFilters, TripProposal } from '../../types/travel';
import type { Compatibility } from './compatibility';
import type { DiscoverySort } from './sort-proposals';
import { resolveDiscoveryRange } from './filter-trips.ts';
import { findTripLocation } from '../trips/trip-locations.ts';
import type { Recommendation } from '../recommendations/recommendation';

export const TRIP_SEARCH_PAGE_SIZE = 5;

export interface TripSearchCursor {
  id: string;
  published_at: string;
  score: number;
  sort: DiscoverySort;
  query_key: string;
  rank?: number;
  version?: 2;
}
export interface RankedTripProposal extends TripProposal {
  // Only the demonstration adapter retains the legacy arithmetic for sorting.
  compatibility?: Compatibility;
  recommendation?: Recommendation;
}
export interface TripSearchPage {
  items: RankedTripProposal[];
  totalCount: number;
  hasMore: boolean;
  cursor: TripSearchCursor | null;
}
export function discoveryFiltersPayload(filters: DiscoveryFilters) {
  const selected = findTripLocation(filters.locationId);
  const range = resolveDiscoveryRange(filters);
  return {
    trip_modes: [...new Set(filters.tripModes)].sort(),
    landscapes: [...new Set(filters.landscapeKinds ?? [])].sort(),
    group_kinds: [...new Set(filters.groupKinds ?? [])].sort(),
    child_age_bands: [...new Set(filters.childAgeBands)].sort(),
    animal_kinds: [...new Set(filters.animalKinds ?? [])].sort(),
    favorites_only: !!filters.favoritesOnly,
    location_query: filters.location.trim(),
    location: selected ? { id: selected.id, kind: selected.kind, name: selected.name, region: selected.region, country: selected.country } : null,
    start_date: range?.startDate ?? null,
    end_date: range?.endDate ?? null,
    tolerance_days: range ? Math.min(7, Math.max(0, Math.trunc(filters.dateFlexibilityDays ?? 0))) : 0,
    source_trip_id: filters.sourceTripId ?? null,
  };
}
export function discoveryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return code === 'PGRST202' || code === '42883'
    ? 'Wyszukiwanie wyjazdów nie jest jeszcze dostępne. Spróbuj ponownie za chwilę.'
    : 'Nie udało się pobrać ogłoszeń. Sprawdź połączenie i spróbuj ponownie.';
}
