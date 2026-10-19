import type { TravelerProfile } from '../../types/profile';
import type { ChildAgeBand } from '../../types/travel';
import {
  cloneAnimals,
  emptyAnimals,
  validateAnimalCounts,
} from '../animals/animal-data.ts';

export function createEmptyProfile(): TravelerProfile {
  return {
    group: {
      id: 'demo-us',
      name: '',
      kind: 'family',
      adultCount: 2,
      childCount: 0,
      childAgeBands: [],
      homeLocation: '',
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
      ...profile.group,
      childAgeBands: [...profile.group.childAgeBands],
      travelModes: [...profile.group.travelModes],
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
  normalized.group.homeLocation = normalized.group.homeLocation.trim();
  normalized.matching.description = normalized.matching.description.trim();
  if (normalized.group.childCount === 0) normalized.group.childAgeBands = [];
  return normalized;
}

export function validateProfile(profile: TravelerProfile): string[] {
  const errors: string[] = [];
  const { group, matching } = profile;
  errors.push(...validateAnimalCounts(group.animals.animals));
  if (group.name.trim().length < 2 || group.name.trim().length > 40)
    errors.push('Nazwa ekipy powinna mieć od 2 do 40 znaków.');
  if (
    group.homeLocation.trim().length < 2 ||
    group.homeLocation.trim().length > 60
  )
    errors.push('Podaj miasto lub przybliżoną okolicę (2–60 znaków).');
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
  if (!group.travelModes.length)
    errors.push('Wybierz przynajmniej jeden sposób podróżowania.');
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
