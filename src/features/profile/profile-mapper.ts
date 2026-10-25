import type { TravelerProfile } from '../../types/profile';
import type { TravelGroup, ChildAgeBand } from '../../types/travel';
import type { AnimalKind } from '../../types/animals';
import type { ProfileAvatarId } from '../../types/avatar';

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
export function profileFromRows(
  group: GroupRow,
  preferences: PreferencesRow,
): TravelerProfile {
  return {
    group: {
      id: group.id,
      ...(group.crew_number ? { crewNumber: group.crew_number } : {}),
      name: group.name,
      avatarId: group.avatar_id,
      kind: group.kind,
      adultCount: group.adult_count,
      childCount: group.child_count,
      childAgeBands: [...group.child_age_bands],
      travelModes: [group.travel_mode],
      interests: [...group.interests],
      animals: { animals: group.animal_kinds.map((kind) => ({ kind })) },
    },
    matching: {
      groupKinds: [...preferences.group_kinds],
      childAgeBands: [...preferences.child_age_bands],
      description: preferences.description,
    },
  };
}
export function profileToPayload(profile: TravelerProfile) {
  return {
    name: profile.group.name.trim(),
    avatar_id: profile.group.avatarId,
    kind: profile.group.kind,
    adult_count: profile.group.adultCount,
    child_count: profile.group.childCount,
    child_age_bands: [...profile.group.childAgeBands],
    travel_mode: profile.group.travelModes[0],
    interests: [...profile.group.interests],
    animal_kinds: profile.group.animals.animals.map((animal) => animal.kind),
    matching: {
      group_kinds: [...profile.matching.groupKinds],
      child_age_bands: [...profile.matching.childAgeBands],
      description: profile.matching.description.trim(),
    },
  };
}
