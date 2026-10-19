export type AnimalKind = 'dog' | 'cat' | 'other';
export interface AnimalCount {
  kind: AnimalKind;
  count: number;
}
export interface GroupAnimals {
  animals: AnimalCount[];
  welcomesAnimals: boolean;
}
export type TripAnimals = GroupAnimals;
