import type { AnimalKind } from '../../types/animals';
import type { LocationOption } from '../../types/location';
import type { TripStatus, TripVisibility } from '../../types/owned-trip';
import type {
  ChildAgeBand,
  LandscapeKind,
  TravelGroup,
  TripMode,
} from '../../types/travel';
import type { GroupRow } from './profile';

export type TripRow = {
  adult_count?: number | null;
  child_count?: number | null;
  child_age_bands?: ChildAgeBand[];
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
