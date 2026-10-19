export type AnimalKind = 'dog' | 'cat' | 'other';
export interface Animal {
  kind: AnimalKind;
}
export interface GroupAnimals {
  animals: Animal[];
}
export type TripAnimals = GroupAnimals;
