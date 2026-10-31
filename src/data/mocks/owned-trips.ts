import { MY_GROUP, MY_TRIPS } from './travel';
import type { OwnedTrip } from '../../types/owned-trip';

export const DEMO_OWN_TRIPS: OwnedTrip[] = MY_TRIPS.map((trip) => ({
  ...trip,
  status: 'published',
  visibility: 'public',
  travelModes: [...MY_GROUP.travelModes],
}));
