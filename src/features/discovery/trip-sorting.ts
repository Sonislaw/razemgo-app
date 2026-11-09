import type {TripProposal} from '../../types/travel';

export const TRIP_SORT_OPTIONS = [
  {value: 'newest', label: 'Najnowsze ogłoszenia', detail: 'Od najnowszej daty publikacji.'},
  {value: 'date_asc', label: 'Termin wyjazdu rosnąco', detail: 'Od najwcześniejszej daty rozpoczęcia.'},
  {value: 'date_desc', label: 'Termin wyjazdu malejąco', detail: 'Od najpóźniejszej daty rozpoczęcia.'},
] as const;
export type TripSortOrder = typeof TRIP_SORT_OPTIONS[number]['value'];
export const DEFAULT_TRIP_SORT: TripSortOrder = 'newest';

export function compareTripProposals(a: TripProposal, b: TripProposal, order: TripSortOrder): number {
  const dates = order === 'date_asc' ? a.trip.startDate.localeCompare(b.trip.startDate)
    : order === 'date_desc' ? b.trip.startDate.localeCompare(a.trip.startDate) : 0;
  return dates || (b.trip.publishedAt ?? '').localeCompare(a.trip.publishedAt ?? '') || a.trip.id.localeCompare(b.trip.id);
}
