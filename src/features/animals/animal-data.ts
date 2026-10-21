import type {
  Animal,
  AnimalKind,
  GroupAnimals,
  TripAnimals,
} from '../../types/animals';

export const ANIMAL_OPTIONS: { kind: AnimalKind; label: string }[] = [
  { kind: 'dog', label: 'Pies' },
  { kind: 'cat', label: 'Kot' },
];
export function emptyAnimals(): GroupAnimals {
  return { animals: [] };
}
export function cloneAnimals(value: GroupAnimals): GroupAnimals {
  return { animals: value.animals.map(({ kind }) => ({ kind })) };
}
export function validateAnimals(value: Animal[]): string[] {
  return value.some(
    (item) => !ANIMAL_OPTIONS.some((option) => option.kind === item.kind),
  ) || new Set(value.map((item) => item.kind)).size !== value.length
    ? ['Sprawdź wybrane rodzaje zwierząt.']
    : [];
}
export function animalSummary(animals: Animal[]): string {
  return animals
    .map(
      ({ kind }) =>
        ANIMAL_OPTIONS.find((option) => option.kind === kind)?.label ??
        'Zwierzę',
    )
    .join(' · ');
}
export function tripAnimalSummary(value: TripAnimals): string {
  if (!value.animals.length) return 'Bez zwierząt na tym wyjeździe';
  if (value.animals.length === 1)
    return value.animals[0].kind === 'dog'
      ? 'Z psem'
      : value.animals[0].kind === 'cat'
        ? 'Z kotem'
        : 'Ze zwierzęciem';
  return animalSummary(value.animals);
}
