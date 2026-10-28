import {
  parseGroupRow,
  parsePreferencesRow,
} from '../../data/contracts/validate.ts';
import type { TravelerProfile } from '../../types/profile';

export type { GroupRow, PreferencesRow } from '../../data/contracts/profile';

export function profileFromRows(
  groupInput: unknown,
  preferencesInput: unknown,
): TravelerProfile {
  const group = parseGroupRow(groupInput);
  const preferences = parsePreferencesRow(preferencesInput);
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
