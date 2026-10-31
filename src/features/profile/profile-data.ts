import type { TravelerProfile } from '../../types/profile';
import {
  DEFAULT_PROFILE_AVATAR_ID,
  getProfileAvatar,
} from './profile-avatar-data.ts';
import {
  cloneAnimals,
  emptyAnimals,
  validateAnimals,
} from '../animals/animal-data.ts';

export const MAX_GROUP_NAME_LENGTH = 20;

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
  };
}

export function cloneProfile(profile: TravelerProfile): TravelerProfile {
  return {
    group: {
      id: profile.group.id,
      ...(profile.group.crewNumber ? { crewNumber: profile.group.crewNumber } : {}),
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
  };
}

export function normalizeProfile(profile: TravelerProfile): TravelerProfile {
  const normalized = cloneProfile(profile);
  normalized.group.name = normalized.group.name.trim();
  if (normalized.group.childCount === 0) normalized.group.childAgeBands = [];
  return normalized;
}

export function validateProfile(profile: TravelerProfile): string[] {
  const errors: string[] = [];
  const { group } = profile;
  errors.push(...validateAnimals(group.animals.animals));
  if (
    group.name.trim().length < 2 ||
    group.name.trim().length > MAX_GROUP_NAME_LENGTH
  )
    errors.push(`Nazwa ekipy powinna mieć od 2 do ${MAX_GROUP_NAME_LENGTH} znaków.`);
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
