import type { AnimalKind, GroupAnimals, TripAnimals } from './animals';

export type ChildAgeBand = '0–3' | '4–6' | '7–9' | '10–12' | '13–17';
export type TripMode = 'planned' | 'flexible';
export type LandscapeKind = 'coast' | 'lake' | 'mountain' | 'forest';

export interface TravelGroup {
  id: string;
  name: string;
  kind: 'family' | 'couple' | 'solo' | 'friends';
  adultCount: number;
  childCount: number;
  childAgeBands: ChildAgeBand[];
  homeLocation: string;
  travelModes: string[];
  interests: string[];
  animals: GroupAnimals;
}
export interface DateRange {
  startDate: string;
  endDate: string;
}
interface TripBase extends DateRange {
  id: string;
  groupId: string;
  title: string;
  description: string;
  interests: string[];
  landscape: LandscapeKind;
  animals: TripAnimals;
}
export type TripPlan = TripBase &
  (
    | {
        mode: 'planned';
        destination: { name: string; region: string };
        travelArea?: never;
      }
    | {
        mode: 'flexible';
        travelArea: { name: string; region: string };
        destination?: never;
      }
  );
export interface DiscoveryFilters {
  mode: TripMode;
  dateRangeId: string;
  location: string;
  childAgeBands: ChildAgeBand[];
  customDateRange?: DateRange;
  animalKinds?: AnimalKind[];
  dateFlexibilityDays?: number;
  sourceTripId?: string;
  groupKinds?: TravelGroup['kind'][];
}
export interface DemoDateRange extends DateRange {
  id: string;
  label: string;
}
export interface TripProposal {
  trip: TripPlan;
  group: TravelGroup;
}
