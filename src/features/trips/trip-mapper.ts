import type { GroupRow } from '../profile/profile-mapper';
import type { OwnedTrip, TripForm, TripStatus, TripVisibility } from '../../types/owned-trip';
import type { ChildAgeBand, LandscapeKind, TravelGroup, TripMode, TripProposal } from '../../types/travel';
import type { AnimalKind } from '../../types/animals';
import type { LocationOption } from '../../types/location';
import { findTripLocation } from './trip-locations.ts';

export type TripRow = {
  id: string;
  group_id: string;
  create_key?: string | null;
  mode: TripMode;
  status: TripStatus;
  visibility: TripVisibility;
  start_date: string | null;
  end_date: string | null;
  location_id: string;
  location_name: string;
  location_region: string;
  location_kind: LocationOption['kind'] | null;
  campground_name: string;
  campground_address: string;
  travel_mode: string | null;
  description: string;
  landscape: LandscapeKind;
  interests: string[];
  animal_kinds: AnimalKind[];
  matching_group_kinds: TravelGroup['kind'][];
  matching_child_age_bands: ChildAgeBand[];
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
};
export type PublicTripRow = {
  trip: TripRow;
  crew: Omit<GroupRow, 'owner_user_id'>;
};
export function tripToPayload(form: TripForm) {
  const location = findTripLocation(form.locationId);
  const concrete = form.mode === 'planned' && location && ['city','village','locality'].includes(location.kind);
  return {
    mode: form.mode,
    visibility: form.visibility,
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    location_id: location?.id ?? '',
    location_name: location?.name ?? '',
    location_region: location?.region ?? '',
    location_kind: location?.kind ?? null,
    campground_name: concrete ? form.campgroundName.trim() : '',
    campground_address: concrete ? (form.campgroundAddress?.trim() ?? '') : '',
    travel_mode: form.travelModes[0] ?? null,
    description: form.description.trim(),
    landscape: form.landscape,
    interests: [...form.interests],
    animal_kinds: form.animals.animals.map(({ kind }) => kind),
    matching_group_kinds: [...form.groupKinds],
    matching_child_age_bands: [...form.childAgeBands],
  };
}
export function tripFromRow(row: TripRow): OwnedTrip {
  const base = {
    id: row.id, groupId: row.group_id,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    startDate: row.start_date ?? '', endDate: row.end_date ?? '',
    description: row.description, landscape: row.landscape,
    ...(row.mode === 'planned' && row.campground_name ? { campgroundName: row.campground_name } : {}),
    ...(row.mode === 'planned' && row.campground_address ? { campgroundAddress: row.campground_address } : {}),
    interests: [...row.interests],
    animals: { animals: row.animal_kinds.map(kind => ({ kind })) },
    travelModes: row.travel_mode ? [row.travel_mode] : [],
    status: row.status, visibility: row.visibility,
    matching: { groupKinds: [...row.matching_group_kinds], childAgeBands: [...row.matching_child_age_bands] },
  };
  const place = { name: row.location_name, region: row.location_region, ...(row.location_id ? { locationId: row.location_id } : {}) };
  return row.mode === 'planned'
    ? { ...base, mode: 'planned', destination: place }
    : { ...base, mode: 'flexible', travelArea: place };
}
export function proposalFromRow({ trip, crew }: PublicTripRow): TripProposal {
  return {
    trip: tripFromRow(trip),
    group: {
      id: crew.id, name: crew.name, avatarId: crew.avatar_id, kind: crew.kind,
      ...(crew.crew_number ? { crewNumber: crew.crew_number } : {}),
      adultCount: crew.adult_count, childCount: crew.child_count,
      childAgeBands: [...crew.child_age_bands], travelModes: [crew.travel_mode],
      interests: [...crew.interests],
      animals: { animals: crew.animal_kinds.map(kind => ({ kind })) },
    },
  };
}
