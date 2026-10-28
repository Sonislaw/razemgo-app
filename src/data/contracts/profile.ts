import type { AnimalKind } from '../../types/animals';
import type { ProfileAvatarId } from '../../types/avatar';
import type { ChildAgeBand, TravelGroup } from '../../types/travel';

export type GroupRow = {
  id: string;
  crew_number?: number;
  owner_user_id: string;
  name: string;
  avatar_id: ProfileAvatarId;
  kind: TravelGroup['kind'];
  adult_count: number;
  child_count: number;
  child_age_bands: ChildAgeBand[];
  travel_mode: string;
  interests: string[];
  animal_kinds: AnimalKind[];
};
export type PreferencesRow = {
  group_id: string;
  group_kinds: TravelGroup['kind'][];
  child_age_bands: ChildAgeBand[];
  description: string;
};
