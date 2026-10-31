// Compatibility reference types never enter the current application model.
import type {
  ChildAgeBand,
  TravelGroup,
  TripPlan,
} from '../../../src/types/travel';
export type LegacyTrip<T = TripPlan> = T & {
  matching?: {
    groupKinds: TravelGroup['kind'][];
    childAgeBands: ChildAgeBand[];
  };
};
