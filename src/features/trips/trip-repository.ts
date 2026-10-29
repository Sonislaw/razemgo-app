import type { OwnTripCursor } from '@/data/contracts/pages';
import { integer, object } from '@/data/contracts/validate';
import { backendRequest } from '@/lib/backend-request';
import { todayDate } from '@/lib/calendar-date';
import { getSupabase } from '@/lib/supabase';
import type { OwnTripFilters, TripForm, TripStatus } from '@/types/owned-trip';
import { tripFromRow, tripToPayload } from './trip-mapper';

export const OWN_TRIP_PAGE_SIZE = 5;

export async function fetchOwnTrips() {
  const page = await fetchOwnTripPage();
  return [
    ...new Map(
      [...page.items, ...(page.latest ? [page.latest] : [])].map((trip) => [
        trip.id,
        trip,
      ]),
    ).values(),
  ];
}
export async function fetchOwnTripPage(
  filters?: OwnTripFilters,
  archived = false,
  cursor?: OwnTripCursor,
  parentSignal?: AbortSignal,
  referenceDay = todayDate(),
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('list_my_trip_page', {
          archived,
          filters: {
            query: filters?.query ?? '',
            start_date: filters?.startDate || null,
            end_date: filters?.endDate || null,
            today: referenceDay,
          },
          after_cursor: cursor ?? null,
          page_size: OWN_TRIP_PAGE_SIZE,
        })
        .abortSignal(signal),
    'trips.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  const row = object(data);
  if (
    !Array.isArray(row.items) ||
    row.items.length > OWN_TRIP_PAGE_SIZE ||
    typeof row.has_more !== 'boolean' ||
    (row.has_more && !row.cursor)
  )
    throw new Error('Invalid trip page');
  integer(row.total_count);
  integer(row.active_count);
  integer(row.archived_count);
  return {
    items: data!.items.map(tripFromRow),
    totalCount: data!.total_count,
    activeCount: data!.active_count,
    archivedCount: data!.archived_count,
    hasMore: data!.has_more,
    cursor: data!.cursor,
    latest: data!.latest_trip ? tripFromRow(data!.latest_trip) : null,
  };
}
export async function fetchOwnTrip(id: string, parentSignal?: AbortSignal) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return null;
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_my_trip', { target_trip_id: id })
        .abortSignal(signal),
    'trips.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  return data ? tripFromRow(data) : null;
}
export async function persistTrip(
  form: TripForm,
  id?: string,
  draft = false,
  requestKey?: string,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('save_my_trip', {
          trip_data: tripToPayload(form),
          trip_id: id ?? null,
          as_draft: draft,
          request_key: requestKey ?? null,
        })
        .abortSignal(signal),
    'trips.save',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing saved trip');
  return tripFromRow(data);
}
export async function persistTripStatus(
  id: string,
  status: Exclude<TripStatus, 'draft'>,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('change_my_trip_status', { trip_id: id, new_status: status })
        .abortSignal(signal),
    'trips.status',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing saved trip');
  return tripFromRow(data);
}
export async function duplicateTrip(id: string) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('duplicate_my_trip', { trip_id: id })
        .abortSignal(signal),
    'trips.duplicate',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing copied trip');
  return tripFromRow(data);
}
export async function removeTrip(id: string) {
  const { error } = await backendRequest(
    (signal) =>
      getSupabase().rpc('delete_my_trip', { trip_id: id }).abortSignal(signal),
    'trips.delete',
  );
  if (error) throw error;
}
export function tripErrorMessage(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code;
  if (code === 'P0002')
    return 'Ten wyjazd jest niedostępny. Odśwież listę wyjazdów.';
  if (code === '22023')
    return 'Nie można teraz wykonać tej operacji. Sprawdź dane i odśwież wyjazdy.';
  return fallback;
}
