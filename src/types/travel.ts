import type { AnimalKind, GroupAnimals, TripAnimals } from './animals';
import type { ProfileAvatarId } from './avatar';

export type ChildAgeBand = '0–3' | '4–6' | '7–9' | '10–12' | '13–17';
export type TripMode = 'planned' | 'flexible';
export type LandscapeKind = 'coast' | 'lake' | 'mountain' | 'forest';

export interface TravelGroup {
  id: string;
  name: string;
  avatarId?: ProfileAvatarId;
  kind: 'family' | 'couple' | 'solo' | 'friends';
  adultCount: number;
  childCount: number;
  childAgeBands: ChildAgeBand[];
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
  publishedAt?: string;
  groupId: string;
  description: string;
  campgroundName?: string;
  interests: string[];
  landscape: LandscapeKind;
  animals: TripAnimals;
}
export interface TripPlace {
  name: string;
  region: string;
  locationId?: string;
}
export type TripPlan = TripBase &
  (
    | {
        mode: 'planned';
        destination: TripPlace;
        travelArea?: never;
      }
    | {
        mode: 'flexible';
        travelArea: TripPlace;
        destination?: never;
      }
  );
export interface DiscoveryFilters {
  tripModes: TripMode[];
  dateRangeId: 'all' | 'custom' | 'own-trip';
  location: string;
  locationId?: string;
  childAgeBands: ChildAgeBand[];
  customDateRange?: DateRange;
  animalKinds?: AnimalKind[];
  landscapeKinds?: LandscapeKind[];
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
