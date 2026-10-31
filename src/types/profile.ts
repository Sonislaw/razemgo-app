import type { TravelGroup } from './travel';

export interface TravelerProfile {
  group: TravelGroup;
}

export type ProfileSection =
  'crew' | 'travel' | 'interests' | 'animals';
