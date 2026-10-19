import type { TripAnimals } from './animals';
import type {
  ChildAgeBand,
  LandscapeKind,
  TravelGroup,
  TripMode,
  TripPlan,
} from './travel';

export type TripStatus =
  'draft' | 'published' | 'paused' | 'completed' | 'cancelled';
export type TripVisibility = 'public' | 'private';
export type OwnedTrip = TripPlan & {
  status: TripStatus;
  visibility: TripVisibility;
  travelModes: string[];
  matching: {
    groupKinds: TravelGroup['kind'][];
    childAgeBands: ChildAgeBand[];
  };
};
export interface TripForm {
  mode: TripMode;
  startDate: string;
  endDate: string;
  locationId: string;
  travelModes: string[];
  interests: string[];
  description: string;
  landscape: LandscapeKind;
  groupKinds: TravelGroup['kind'][];
  childAgeBands: ChildAgeBand[];
  visibility: TripVisibility;
  animals: TripAnimals;
}
export interface OwnTripsState {
  trips: OwnedTrip[];
  nextSequence: number;
  revision: number;
  lastSavedId?: string;
}
export interface OwnTripFilters {
  query: string;
  startDate: string;
  endDate: string;
}
