import type { TravelGroup } from './travel';

export interface TravelerProfile {
  group: TravelGroup;
  about?: string;
}

export type ProfileSection =
  'crew' | 'travel' | 'interests' | 'animals';
