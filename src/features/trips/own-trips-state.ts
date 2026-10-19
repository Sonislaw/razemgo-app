import type {
  OwnedTrip,
  OwnTripFilters,
  OwnTripsState,
  TripForm,
  TripStatus,
} from '../../types/owned-trip';
import type { TravelerProfile } from '../../types/profile';
import type { DiscoveryFilters } from '../../types/travel';
import { cloneAnimals, validateAnimals } from '../animals/animal-data.ts';
import {
  findTripLocation,
  tripLocationIdForPlace,
  TRIP_LOCATION_REQUIRED_ERROR,
} from './trip-locations.ts';

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  draft: 'Szkic',
  published: 'Szukamy towarzystwa',
  paused: 'Wstrzymany',
  completed: 'Zakończony',
  cancelled: 'Anulowany',
};
export const EMPTY_TRIP_FILTERS: OwnTripFilters = {
  query: '',
  startDate: '',
  endDate: '',
};
export function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function isValidDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(value: string, days: number): string {
  return new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function getTripStatus(trip: OwnedTrip, today: string): TripStatus {
  return (trip.status === 'published' || trip.status === 'paused') &&
    isValidDate(trip.endDate) &&
    trip.endDate <= today
    ? 'completed'
    : trip.status;
}
export function isArchivedTrip(trip: OwnedTrip, today: string): boolean {
  return ['completed', 'cancelled'].includes(getTripStatus(trip, today));
}
export function isSearchingTrip(trip: OwnedTrip, today: string): boolean {
  return (
    getTripStatus(trip, today) === 'published' && trip.visibility === 'public'
  );
}
export function selectNextTrip(
  trips: OwnedTrip[],
  today: string,
): OwnedTrip | undefined {
  return trips
    .filter(
      (trip) =>
        (trip.status === 'published' || trip.status === 'paused') &&
        isValidDate(trip.startDate) &&
        isValidDate(trip.endDate) &&
        trip.endDate > trip.startDate &&
        trip.endDate > today,
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
    )[0];
}
export function discoveryFiltersForTrip(trip: OwnedTrip): DiscoveryFilters {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  const valid = isValidDate(trip.startDate) && isValidDate(trip.endDate);
  return {
    tripModes: ['planned', 'flexible'],
    sourceTripId: trip.id,
    dateRangeId: valid ? 'own-trip' : 'all',
    customDateRange: valid
      ? {
          startDate: trip.startDate,
          endDate: trip.endDate,
        }
      : undefined,
    location: place.region || place.name,
    dateFlexibilityDays: 0,
    groupKinds: [...trip.matching.groupKinds],
    childAgeBands: [...trip.matching.childAgeBands],
  };
}
export function toTripForm(trip: OwnedTrip): TripForm {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  return {
    mode: trip.mode,
    startDate: trip.startDate,
    endDate: trip.endDate,
    locationId: tripLocationIdForPlace(place),
    travelModes: [...trip.travelModes],
    interests: [...trip.interests],
    description: trip.description,
    landscape: trip.landscape,
    groupKinds: [...trip.matching.groupKinds],
    childAgeBands: [...trip.matching.childAgeBands],
    visibility: trip.visibility,
    animals: cloneAnimals(trip.animals),
  };
}
export function newTripForm(profile: TravelerProfile): TripForm {
  return {
    mode: 'planned',
    startDate: '',
    endDate: '',
    locationId: '',
    travelModes: [...profile.group.travelModes],
    interests: [],
    description: '',
    landscape: 'coast',
    groupKinds: [...profile.matching.groupKinds],
    childAgeBands: [...profile.matching.childAgeBands],
    visibility: 'public',
    animals: cloneAnimals(profile.group.animals),
  };
}
export function validateTripForm(form: TripForm, step?: 1 | 2 | 3): string[] {
  const errors: string[] = [];
  if (!step || step === 1) {
    if (!isValidDate(form.startDate) || !isValidDate(form.endDate))
      errors.push('Wybierz poprawną datę wyjazdu i powrotu.');
    else if (form.endDate <= form.startDate)
      errors.push(
        'Powrót musi przypadać po wyjeździe — zaplanuj co najmniej jedną noc.',
      );
  }
  if (!step || step === 2) {
    errors.push(...validateAnimals(form.animals.animals));
    if (!findTripLocation(form.locationId))
      errors.push(TRIP_LOCATION_REQUIRED_ERROR);
    if (!form.travelModes.length)
      errors.push('Wybierz przynajmniej jeden sposób podróżowania.');
    if (form.description.trim().length > 1000)
      errors.push('Skróć opis do 1000 znaków.');
  }
  return errors;
}
export function tripFromForm(
  form: TripForm,
  id: string,
  groupId: string,
  status: TripStatus,
): OwnedTrip {
  const base = {
    id,
    groupId,
    startDate: form.startDate,
    endDate: form.endDate,
    description: form.description.trim(),
    landscape: form.landscape,
    interests: [...form.interests],
    travelModes: [...form.travelModes],
    visibility: form.visibility,
    status,
    animals: cloneAnimals(form.animals),
    matching: {
      groupKinds: [...form.groupKinds],
      childAgeBands: [...form.childAgeBands],
    },
  };
  const location = findTripLocation(form.locationId);
  const place = {
    name: location?.name ?? '',
    region: location?.region ?? '',
    ...(location ? { locationId: location.id } : {}),
  };
  return form.mode === 'planned'
    ? { ...base, mode: 'planned', destination: place }
    : { ...base, mode: 'flexible', travelArea: place };
}
export function createOwnTripsState(trips: OwnedTrip[]): OwnTripsState {
  return {
    trips: trips.map((trip) =>
      tripFromForm(toTripForm(trip), trip.id, trip.groupId, trip.status),
    ),
    nextSequence: 1,
    revision: 0,
  };
}
export function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
export function selectOwnTrips(
  trips: OwnedTrip[],
  filters: OwnTripFilters,
  archived: boolean,
  today: string,
): OwnedTrip[] {
  const query = normalizeSearch(filters.query);
  return trips
    .filter((trip) => {
      if (isArchivedTrip(trip, today) !== archived) return false;
      const place =
        trip.mode === 'planned' ? trip.destination : trip.travelArea;
      const regionAlias = /^(pomorze|pomorskie)$/iu.test(place.region)
        ? 'Pomorze Pomorskie'
        : '';
      if (
        query &&
        !normalizeSearch(
          `${trip.description} ${place.name} ${place.region} ${regionAlias}`,
        ).includes(query)
      )
        return false;
      if (
        filters.startDate &&
        (!isValidDate(trip.endDate) || trip.endDate <= filters.startDate)
      )
        return false;
      if (
        filters.endDate &&
        (!isValidDate(trip.startDate) || trip.startDate >= filters.endDate)
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = isValidDate(a.startDate) ? a.startDate : '9999';
      const dateB = isValidDate(b.startDate) ? b.startDate : '9999';
      return (
        (archived ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB)) ||
        a.id.localeCompare(b.id)
      );
    });
}
export type OwnTripsAction =
  | {
      type: 'save';
      form: TripForm;
      id?: string;
      groupId: string;
      draft: boolean;
      today: string;
    }
  | {
      type: 'status';
      id: string;
      status: 'published' | 'paused' | 'completed' | 'cancelled';
      today: string;
    }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'reset'; state: OwnTripsState };

export function ownTripsReducer(
  state: OwnTripsState,
  action: OwnTripsAction,
): OwnTripsState {
  if (action.type === 'reset') return action.state;
  if (action.type === 'save') {
    const existing = action.id
      ? state.trips.find((trip) => trip.id === action.id)
      : undefined;
    if (action.id && !existing) return state;
    if (!action.draft && validateTripForm(action.form).length) return state;
    const previous = existing ? getTripStatus(existing, action.today) : 'draft';
    let status: TripStatus = action.draft
      ? 'draft'
      : previous === 'draft'
        ? 'published'
        : previous;
    if (status === 'published' && action.form.visibility === 'private')
      status = 'paused';
    if (
      !action.draft &&
      !['completed', 'cancelled'].includes(status) &&
      action.form.endDate <= action.today
    )
      return state;
    const trip = tripFromForm(
      action.form,
      existing?.id ?? `local-trip-${state.nextSequence}`,
      action.groupId,
      status,
    );
    return {
      ...state,
      trips: existing
        ? state.trips.map((item) => (item.id === trip.id ? trip : item))
        : [...state.trips, trip],
      nextSequence: state.nextSequence + (existing ? 0 : 1),
      revision: state.revision + 1,
      lastSavedId: trip.id,
    };
  }
  const trip = state.trips.find((item) => item.id === action.id);
  if (!trip) return state;
  if (action.type === 'delete')
    return {
      ...state,
      trips: state.trips.filter((item) => item.id !== trip.id),
    };
  if (action.type === 'duplicate') {
    const form = toTripForm(trip);
    form.visibility = 'private';
    return {
      ...state,
      nextSequence: state.nextSequence + 1,
      trips: [
        ...state.trips,
        tripFromForm(
          form,
          `local-trip-${state.nextSequence}`,
          trip.groupId,
          'draft',
        ),
      ],
      revision: state.revision + 1,
      lastSavedId: `local-trip-${state.nextSequence}`,
    };
  }
  const current = getTripStatus(trip, action.today);
  const allowed =
    (action.status === 'published' && current === 'paused') ||
    (action.status === 'paused' && current === 'published') ||
    (['completed', 'cancelled'].includes(action.status) &&
      ['published', 'paused'].includes(current));
  if (
    !allowed ||
    (action.status === 'published' &&
      (validateTripForm(toTripForm(trip)).length ||
        trip.endDate <= action.today))
  )
    return state;
  return {
    ...state,
    trips: state.trips.map((item) =>
      item.id === trip.id
        ? {
            ...item,
            status: action.status,
            visibility:
              action.status === 'published' ? 'public' : item.visibility,
          }
        : item,
    ),
  };
}
