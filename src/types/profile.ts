import type { ChildAgeBand, TravelGroup } from './travel';

export interface MatchingPreferences {
  groupKinds: TravelGroup['kind'][];
  childAgeBands: ChildAgeBand[];
  description: string;
}

export interface TravelerProfile {
  group: TravelGroup;
  matching: MatchingPreferences;
}

export type ProfileSection = 'crew' | 'travel' | 'interests' | 'matching';
