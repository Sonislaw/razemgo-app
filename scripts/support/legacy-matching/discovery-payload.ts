// Source-trip context belongs only to still-supported V1/V2 regression reads.
import { discoveryFiltersPayload as currentPayload } from '../../../src/features/discovery/discovery-data.ts';
import type { DiscoveryFilters } from '../../../src/types/travel';

export function discoveryFiltersPayload(filters: DiscoveryFilters) {
  return { ...currentPayload(filters), source_trip_id: filters.sourceTripId ?? null };
}
