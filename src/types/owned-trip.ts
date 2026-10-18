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
export type DateFlexibility = 0 | 1 | 3 | 7;
export type OwnedTrip = TripPlan & {
  status: TripStatus;
  visibility: TripVisibility;
  dateFlexibilityDays: DateFlexibility;
  travelModes: string[];
  matching: {
    groupKinds: TravelGroup['kind'][];
    childAgeBands: ChildAgeBand[];
  };
};
export interface TripForm {
  mode: TripMode;
  title: string;
  startDate: string;
  endDate: string;
  placeName: string;
  region: string;
  dateFlexibilityDays: DateFlexibility;
  travelModes: string[];
  interests: string[];
  description: string;
  landscape: LandscapeKind;
  groupKinds: TravelGroup['kind'][];
  childAgeBands: ChildAgeBand[];
  visibility: TripVisibility;
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
