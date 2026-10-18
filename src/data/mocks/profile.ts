import type { TravelerProfile } from '../../types/profile';
import { MY_GROUP } from './travel';

export const DEMO_PROFILE: TravelerProfile = {
  group: { ...MY_GROUP, name: 'Nasza ekipa' },
  matching: {
    groupKinds: ['family'],
    childAgeBands: ['4–6', '7–9'],
    description:
      'Najchętniej poznamy rodziny z dziećmi w podobnym wieku. Lubimy spokojne wyjazdy i wspólne aktywności.',
  },
};
