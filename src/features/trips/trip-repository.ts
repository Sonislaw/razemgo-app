import { getSupabase } from '@/lib/supabase';
import { backendRequest } from '@/lib/backend-request';
import type { TripForm, TripStatus } from '@/types/owned-trip';
import { tripFromRow, tripToPayload } from './trip-mapper';

export async function fetchOwnTrips() {
  const trips = [];
  for (let page = 0; ; page++) {
    const { data, error } = await backendRequest(signal =>
      getSupabase().from('trip_plans').select('*')
        .order('created_at', { ascending: false }).order('id')
        .range(page * 500, page * 500 + 499).abortSignal(signal), 'trips.load',
    );
    if (error) throw error;
    trips.push(...(data ?? []).map(tripFromRow));
    if (!data || data.length < 500) return trips;
  }
}
export async function persistTrip(form: TripForm, id?: string, draft = false, requestKey?: string) {
  const { data, error } = await backendRequest(signal =>
    getSupabase().rpc('save_my_trip', {
      trip_data: tripToPayload(form), trip_id: id ?? null, as_draft: draft, request_key: requestKey ?? null,
    }).abortSignal(signal), 'trips.save',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing saved trip');
  return tripFromRow(data);
}
export async function persistTripStatus(id: string, status: Exclude<TripStatus, 'draft'>) {
  const { data, error } = await backendRequest(signal =>
    getSupabase().rpc('change_my_trip_status', { trip_id: id, new_status: status }).abortSignal(signal), 'trips.status',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing saved trip');
  return tripFromRow(data);
}
export async function duplicateTrip(id: string) {
  const { data, error } = await backendRequest(signal =>
    getSupabase().rpc('duplicate_my_trip', { trip_id: id }).abortSignal(signal), 'trips.duplicate',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing copied trip');
  return tripFromRow(data);
}
export async function removeTrip(id: string) {
  const { error } = await backendRequest(signal =>
    getSupabase().rpc('delete_my_trip', { trip_id: id }).abortSignal(signal), 'trips.delete',
  );
  if (error) throw error;
}
export function tripErrorMessage(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code;
  if (code === 'P0002') return 'Ten wyjazd jest niedostępny. Odśwież listę wyjazdów.';
  if (code === '22023') return 'Nie można teraz wykonać tej operacji. Sprawdź dane i odśwież wyjazdy.';
  return fallback;
}
