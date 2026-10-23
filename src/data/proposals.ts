import { USE_DEMO_DATA } from '@/constants/app';
import { DEMO_PROPOSALS } from './mocks/travel';
// Real discovery will replace this empty source in the next backend milestone.
export const AVAILABLE_PROPOSALS = USE_DEMO_DATA ? DEMO_PROPOSALS : [];
