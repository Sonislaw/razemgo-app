// Reference adapter for the V1 ranking contract only. Current UI models never
// restore these retired preferences; SQL compatibility tests still need them.
import {
  tripFromRow as currentTripFromRow,
  proposalFromRow as currentProposalFromRow,
  type PublicTripRow,
} from '../../../src/features/trips/trip-mapper.ts';
import type { TripRow } from '../../../src/data/contracts/trip';

export function tripFromRow(row: TripRow) {
  return {
    ...currentTripFromRow(row),
    matching: {
      groupKinds: [...row.matching_group_kinds],
      childAgeBands: [...row.matching_child_age_bands],
    },
  };
}
export function proposalFromRow(row: PublicTripRow) {
  return { ...currentProposalFromRow(row), trip: tripFromRow(row.trip) };
}
