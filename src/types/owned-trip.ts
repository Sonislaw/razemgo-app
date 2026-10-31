import type { TripAnimals } from './animals';
import type {
  ChildAgeBand,
  LandscapeKind,
  TravelGroup,
  TripMode,
  TripPlan,
  TripParticipants,
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
  participants: TripParticipants | null;
  mode: TripMode;
  startDate: string;
  endDate: string;
  locationId: string;
  campgroundName: string;
  campgroundAddress?: string;
  travelModes: string[];
  interests: string[];
  description: string;
  landscape: LandscapeKind;
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
