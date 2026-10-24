import { getSupabase } from '@/lib/supabase';
import { backendRequest } from '@/lib/backend-request';
import { proposalFromRow } from '@/features/trips/trip-mapper';

export async function fetchPublicTrips() {
  const proposals = new Map<string, ReturnType<typeof proposalFromRow>>();
  for (let page = 0; ; page++) {
    const { data, error } = await backendRequest(signal =>
      getSupabase().rpc('list_public_trips', { requested_trip_id: null })
        .range(page * 500, page * 500 + 499).abortSignal(signal), 'discovery.load',
    );
    if (error) throw error;
    for (const row of data ?? []) {
      const proposal = proposalFromRow(row);
      proposals.set(proposal.trip.id, proposal);
    }
    if (!data || data.length < 500) return [...proposals.values()];
  }
}
