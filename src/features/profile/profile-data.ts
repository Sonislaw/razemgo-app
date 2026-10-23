import type { TravelerProfile } from '../../types/profile';
import type { ChildAgeBand } from '../../types/travel';
import {
  DEFAULT_PROFILE_AVATAR_ID,
  getProfileAvatar,
} from './profile-avatar-data.ts';
import {
  cloneAnimals,
  emptyAnimals,
  validateAnimals,
} from '../animals/animal-data.ts';

export function createEmptyProfile(): TravelerProfile {
  return {
    group: {
      id: '',
      name: '',
      avatarId: DEFAULT_PROFILE_AVATAR_ID,
      kind: 'family',
      adultCount: 1,
      childCount: 0,
      childAgeBands: [],
      travelModes: [],
      interests: [],
      animals: emptyAnimals(),
    },
    matching: { groupKinds: [], childAgeBands: [], description: '' },
  };
}

export function getPreferredChildAges(
  profile: TravelerProfile,
  selectedBands: ChildAgeBand[] = [],
): ChildAgeBand[] {
  if (selectedBands.length) return selectedBands;
  return profile.matching.childAgeBands.length
    ? profile.matching.childAgeBands
    : profile.group.childAgeBands;
}

export function cloneProfile(profile: TravelerProfile): TravelerProfile {
  return {
    group: {
      id: profile.group.id,
      name: profile.group.name,
      avatarId: getProfileAvatar(profile.group.avatarId).id,
      kind: profile.group.kind,
      adultCount: profile.group.adultCount,
      childCount: profile.group.childCount,
      childAgeBands: [...profile.group.childAgeBands],
      travelModes: profile.group.travelModes.slice(0, 1),
      interests: [...profile.group.interests],
      animals: cloneAnimals(profile.group.animals),
    },
    matching: {
      ...profile.matching,
      childAgeBands: [...profile.matching.childAgeBands],
      groupKinds: [...profile.matching.groupKinds],
    },
  };
}

export function normalizeProfile(profile: TravelerProfile): TravelerProfile {
  const normalized = cloneProfile(profile);
  normalized.group.name = normalized.group.name.trim();
  normalized.matching.description = normalized.matching.description.trim();
  if (normalized.group.childCount === 0) normalized.group.childAgeBands = [];
  return normalized;
}

export function validateProfile(profile: TravelerProfile): string[] {
  const errors: string[] = [];
  const { group, matching } = profile;
  errors.push(...validateAnimals(group.animals.animals));
  if (group.name.trim().length < 2 || group.name.trim().length > 40)
    errors.push('Nazwa ekipy powinna mieć od 2 do 40 znaków.');
  if (
    !Number.isInteger(group.adultCount) ||
    group.adultCount < 1 ||
    group.adultCount > 8
  )
    errors.push('Ekipa powinna liczyć od 1 do 8 dorosłych.');
  if (
    !Number.isInteger(group.childCount) ||
    group.childCount < 0 ||
    group.childCount > 6
  )
    errors.push('Liczba dzieci powinna wynosić od 0 do 6.');
  if (group.childAgeBands.length > group.childCount)
    errors.push(
      'Liczba wybranych przedziałów wieku nie może być większa od liczby dzieci.',
    );
  if (group.travelModes.length !== 1)
    errors.push('Wybierz jeden sposób podróżowania.');
  if (matching.description.trim().length > 240)
    errors.push('Opis preferencji może mieć maksymalnie 240 znaków.');
  return errors;
}

export function formatGroupSize(
  adultCount: number,
  childCount: number,
): string {
  const adults = adultCount + (adultCount === 1 ? ' dorosły' : ' dorosłych');
  if (!childCount) return adults + ' · bez dzieci';
  return (
    adults + ' · ' + childCount + (childCount === 1 ? ' dziecko' : ' dzieci')
  );
}
