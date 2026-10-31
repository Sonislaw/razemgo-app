import type { TravelerProfile } from '../../types/profile';
import { MY_GROUP } from './travel';

export const DEMO_PROFILE: TravelerProfile = {
  group: { ...MY_GROUP, name: 'Nasza ekipa', avatarId: 'trail-fox' },
};
