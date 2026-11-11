import {
  cloneTripParticipants,
  participantsFromProfile,
  validateTripParticipants,
} from '../../lib/trip-participants.ts';
import { isValidDate } from '../../lib/calendar-date.ts';
import type {
  OwnedTrip,
  OwnTripFilters,
  OwnTripsState,
  TripForm,
  TripStatus,
} from '../../types/owned-trip';
import type { TravelerProfile } from '../../types/profile';
import type { DiscoveryFilters, TripMode } from '../../types/travel';
import { placeLocation, storePlace, manualPlaceError, isPlaceAllowedForTrip } from './place-data.ts';
import { cloneAnimals, validateAnimals } from '../animals/animal-data.ts';
import {
  isConcreteTripLocation,
  isLocationAllowedForTrip,
  PLANNED_TRIP_LOCATION_REQUIRED_ERROR,
  TRIP_LOCATION_REQUIRED_ERROR,
  tripLocationIdForPlace,
} from './trip-locations.ts';

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  draft: 'Szkic',
  published: 'Szukam towarzystwa',
  paused: 'Wstrzymany',
  completed: 'Zakończony',
  cancelled: 'Anulowany',
};
export const EMPTY_TRIP_FILTERS: OwnTripFilters = {
  query: '',
  startDate: '',
  endDate: '',
};
export const MIN_TRIP_DESCRIPTION_LENGTH = 20;
export const MAX_TRIP_DESCRIPTION_LENGTH = 1000;

export function tripDescriptionLength(description: string): number {
  return Array.from(description.trim().replace(/\s+/gu, ' ')).length;
}

export { isValidDate, shiftDate, todayDate } from '../../lib/calendar-date.ts';
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
    location: place.place ? place.place.userLabel??place.place.name : place.region || place.name,
    ...(place.place ? {place:storePlace(place.place),locationId:place.place.id} : {}),
    dateFlexibilityDays: 0,
    groupKinds: [],
    childAgeBands: [],
  };
}
export function toTripForm(
  trip: OwnedTrip,
  profile?: TravelerProfile,
): TripForm {
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  return {
    participants:
      cloneTripParticipants(trip.participants) ??
      (profile ? participantsFromProfile(profile.group) : null),
    mode: trip.mode,
    ...(trip.mode === 'planned' && trip.searchArea ? {searchArea:storePlace(trip.searchArea)} : {}),
    startDate: trip.startDate,
    endDate: trip.endDate,
    locationId: tripLocationIdForPlace(place),
    ...(place.place ? { place:{...place.place} } : {}),
    campgroundName: trip.mode === 'planned' ? (trip.campgroundName ?? '') : '',
    campgroundAddress:
      trip.mode === 'planned' ? (trip.campgroundAddress ?? '') : '',
    travelModes: trip.travelModes.slice(0, 1),
    interests: [...trip.interests],
    description: trip.description,
    landscape: trip.landscape,
    visibility: trip.visibility,
    animals: cloneAnimals(trip.animals),
  };
}
export function newTripForm(profile: TravelerProfile): TripForm {
  return {
    participants: participantsFromProfile(profile.group),
    mode: 'flexible',
    startDate: '',
    endDate: '',
    locationId: '',
    campgroundName: '',
    campgroundAddress: '',
    travelModes: profile.group.travelModes.slice(0, 1),
    interests: [],
    description: '',
    landscape: 'coast',
    visibility: 'public',
    animals: cloneAnimals(profile.group.animals),
  };
}
export function changeTripLocation(
  form: TripForm,
  locationId: string,
): TripForm {
  const keepCampground =
    form.mode === 'planned' &&
    locationId === form.locationId &&
    isConcreteTripLocation(placeLocation(form.place,locationId));
  return {
    ...form,
    locationId,
    ...(form.place && form.place.id!==locationId ? {place:undefined} : {}),
    campgroundName: keepCampground ? form.campgroundName : '',
    ...(form.campgroundAddress !== undefined
      ? { campgroundAddress: keepCampground ? form.campgroundAddress : '' }
      : {}),
  };
}
export function changeTripMode(form: TripForm, mode: TripMode): TripForm {
  const location = placeLocation(form.place,form.locationId);
  return changeTripLocation(
    { ...form, mode, searchArea:mode==='planned'?(form.searchArea??(form.place?.scope==='area'&&form.place.kind==='locality'?storePlace(form.place):undefined)):undefined },
    (form.place&&!isPlaceAllowedForTrip(form.place,mode))||(location&&!isLocationAllowedForTrip(location,mode))
      ? ''
      : form.locationId,
  );
}

export function changeTripSearchArea(form:TripForm,searchArea?:TripForm['searchArea']):TripForm {
  if(form.searchArea&&searchArea&&JSON.stringify(storePlace(form.searchArea))===JSON.stringify(storePlace(searchArea)))return form;
  return {...changeTripLocation(form,''),searchArea:searchArea?storePlace(searchArea):undefined};
}

export type TripFormField = 'dates' | 'searchArea' | 'locationId' | 'description' | 'participants' | 'travelModes' | 'campgroundName' | 'campgroundAddress' | 'animals';
export interface TripFormIssue { field: TripFormField; message: string }

export function validateTripFormIssues(form: TripForm, step?: 1 | 2): TripFormIssue[] {
  const errors: TripFormIssue[] = [];
  const add = (field: TripFormField, message: string) => errors.push({ field, message });
  if (!step || step === 1) {
    if (!isValidDate(form.startDate) || !isValidDate(form.endDate))
      add('dates', 'Wybierz poprawną datę wyjazdu i powrotu.');
    else if (form.endDate <= form.startDate)
      add('dates',
        'Powrót musi przypadać po wyjeździe — zaplanuj co najmniej jedną noc.',
      );
  }
  if (!step || step === 2) {
    validateAnimals(form.animals.animals).forEach(message => add('animals', message));
    validateTripParticipants(form.participants).forEach(message => add('participants', message));
    const location = placeLocation(form.place,form.locationId);
    if (form.mode==='planned' && (!form.searchArea || form.searchArea.scope!=='area' || form.searchArea.kind!=='locality' || !placeLocation(form.searchArea)))
      add('searchArea','Wybierz miejscowość lub wieś z podpowiedzi lub dodaj ją ręcznie.');
    if(form.mode==='planned'&&form.searchArea?.source==='manual') {
      const error=manualPlaceError(form.searchArea);if(error)add('searchArea',error);
    }
    if (form.mode==='planned' && form.place?.source==='geoapify' && form.place.areaId!==form.searchArea?.id)
      add('locationId','Wybierz konkretne miejsce w wybranym obszarze.');
    if(form.place?.source==='manual') {
      const error=manualPlaceError(form.place);
      if(error)add('locationId',error);
    }
    if(form.place&&!isPlaceAllowedForTrip(form.place,form.mode))
      add('locationId',form.mode==='flexible'?'W trybie „Szukam pomysłu” wybierz miejscowość, region lub kraj. Kemping i konkretny punkt wybierzesz po ustaleniu planu.':'Wybierz kemping lub inne konkretne miejsce w wybranym obszarze.');
    if (!location || !isLocationAllowedForTrip(location, form.mode))
      add('locationId',
        form.mode === 'planned'
          ? PLANNED_TRIP_LOCATION_REQUIRED_ERROR
          : TRIP_LOCATION_REQUIRED_ERROR,
      );
    if (form.travelModes.length !== 1)
      add('travelModes', 'Wybierz jeden sposób podróżowania.');
    if (
      form.mode === 'planned' &&
      isConcreteTripLocation(location) &&
      form.campgroundName.trim().length > 120
    )
      add('campgroundName', 'Skróć nazwę kempingu do 120 znaków.');
    if (
      form.mode === 'planned' &&
      isConcreteTripLocation(location) &&
      (form.campgroundAddress?.trim().length ?? 0) > 200
    )
      add('campgroundAddress', 'Skróć adres kempingu do 200 znaków.');
    if (tripDescriptionLength(form.description) < MIN_TRIP_DESCRIPTION_LENGTH)
      add('description',
        `Opis wyjazdu musi mieć co najmniej ${MIN_TRIP_DESCRIPTION_LENGTH} znaków. Rozwiń opis swoich planów; zbędne spacje nie zwiększają długości.`,
      );
    if (form.description.trim().length > MAX_TRIP_DESCRIPTION_LENGTH)
      add('description', `Skróć opis do ${MAX_TRIP_DESCRIPTION_LENGTH} znaków.`);
  }
  return errors;
}
export function validateTripForm(form: TripForm, step?: 1 | 2): string[] {
  return validateTripFormIssues(form, step).map(issue => issue.message);
}
export function tripFromForm(
  form: TripForm,
  id: string,
  groupId: string,
  status: TripStatus,
  publishedAt?: string,
): OwnedTrip {
  const location = placeLocation(form.place,form.locationId);
  const campgroundName =
    form.mode === 'planned' && isConcreteTripLocation(location)
      ? form.campgroundName.trim()
      : '';
  const campgroundAddress =
    form.mode === 'planned' && isConcreteTripLocation(location)
      ? form.campgroundAddress?.trim()
      : '';
  const base = {
    ...(form.mode === 'planned' && form.searchArea ? {searchArea:storePlace(form.searchArea)} : {}),
    participants: cloneTripParticipants(form.participants),
    id,
    groupId,
    ...(publishedAt ? { publishedAt } : {}),
    startDate: form.startDate,
    endDate: form.endDate,
    description: form.description.trim(),
    ...(campgroundName ? { campgroundName } : {}),
    ...(campgroundAddress ? { campgroundAddress } : {}),
    landscape: form.landscape,
    interests: [...form.interests],
    travelModes: form.travelModes.slice(0, 1),
    visibility: form.visibility,
    status,
    animals: cloneAnimals(form.animals),
  };
  const place = {
    ...(form.place ? {place:{...form.place}} : {}),
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
      tripFromForm(
        toTripForm(trip),
        trip.id,
        trip.groupId,
        trip.status,
        trip.publishedAt,
      ),
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
  | { type: 'hydrate'; trips: OwnedTrip[] }
  | { type: 'persisted'; trip: OwnedTrip }
  | { type: 'removed'; id: string }
  | {
      type: 'save';
      form: TripForm;
      id?: string;
      groupId: string;
      draft: boolean;
      today: string;
      publishedAt?: string;
    }
  | {
      type: 'status';
      id: string;
      status: 'published' | 'paused' | 'completed' | 'cancelled';
      today: string;
      publishedAt?: string;
    }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'reset'; state: OwnTripsState };

export function ownTripsReducer(
  state: OwnTripsState,
  action: OwnTripsAction,
): OwnTripsState {
  if (action.type === 'reset') return action.state;
  if (action.type === 'hydrate') return { ...state, trips: action.trips };
  if (action.type === 'persisted')
    return {
      ...state,
      trips: state.trips.some((trip) => trip.id === action.trip.id)
        ? state.trips.map((trip) =>
            trip.id === action.trip.id ? action.trip : trip,
          )
        : [...state.trips, action.trip],
      revision: state.revision + 1,
      lastSavedId: action.trip.id,
    };
  if (action.type === 'removed')
    return {
      ...state,
      trips: state.trips.filter((trip) => trip.id !== action.id),
      revision: state.revision + 1,
    };
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
      existing?.publishedAt ??
        (status === 'published'
          ? (action.publishedAt ?? action.today + 'T00:00:00.000Z')
          : undefined),
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
            ...(action.status === 'published' && !item.publishedAt
              ? {
                  publishedAt:
                    action.publishedAt ?? action.today + 'T00:00:00.000Z',
                }
              : {}),
          }
        : item,
    ),
  };
}
