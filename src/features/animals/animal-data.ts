import type {
  AnimalCount,
  AnimalKind,
  GroupAnimals,
  TripAnimals,
} from '../../types/animals';

export const ANIMAL_OPTIONS: { kind: AnimalKind; label: string }[] = [
  { kind: 'dog', label: 'Pies' },
  { kind: 'cat', label: 'Kot' },
  { kind: 'other', label: 'Inne zwierzę' },
];
export function emptyAnimals(): GroupAnimals {
  return { animals: [] };
}
export function cloneAnimals(value: GroupAnimals): GroupAnimals {
  return { animals: value.animals.map((item) => ({ ...item })) };
}
export function validateAnimalCounts(value: AnimalCount[]): string[] {
  return value.some(
    (item) =>
      !ANIMAL_OPTIONS.some((option) => option.kind === item.kind) ||
      !Number.isInteger(item.count) ||
      item.count < 1 ||
      item.count > 8,
  ) || new Set(value.map((item) => item.kind)).size !== value.length
    ? ['Podaj od 1 do 8 zwierząt każdego wybranego rodzaju.']
    : [];
}
export function animalCountSummary(animals: AnimalCount[]): string {
  return animals
    .map(({ kind, count }) => {
      if (kind === 'dog')
        return count === 1 ? '1 pies' : count + (count < 5 ? ' psy' : ' psów');
      if (kind === 'cat')
        return count === 1 ? '1 kot' : count + (count < 5 ? ' koty' : ' kotów');
      return count === 1
        ? '1 inne zwierzę'
        : count + (count < 5 ? ' inne zwierzęta' : ' innych zwierząt');
    })
    .join(' · ');
}
export function tripAnimalSummary(value: TripAnimals): string {
  if (!value.animals.length) return 'Bez zwierząt na tym wyjeździe';
  if (value.animals.length === 1 && value.animals[0].count === 1)
    return value.animals[0].kind === 'dog'
      ? 'Z psem'
      : value.animals[0].kind === 'cat'
        ? 'Z kotem'
        : 'Ze zwierzęciem';
  return animalCountSummary(value.animals);
}
