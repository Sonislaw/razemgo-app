import type { TripProposal } from '../../types/travel';

export type DiscoverySort = 'default' | 'compatibility';

export function sortDiscoveryProposals(
  proposals: readonly TripProposal[],
  sort: DiscoverySort,
  scores: Readonly<Record<string, number | undefined>>,
): TripProposal[] {
  const result = [...proposals];
  if (sort === 'default') return result;

  return result.sort((a, b) => {
    const first = scores[a.trip.id];
    const second = scores[b.trip.id];
    if (first === undefined) return second === undefined ? 0 : 1;
    if (second === undefined) return -1;
    return second - first;
  });
}
