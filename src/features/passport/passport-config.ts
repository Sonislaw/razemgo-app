import Constants from 'expo-constants';
import { USE_DEMO_DATA } from '@/constants/app';

export const PASSPORT_ENABLED = Constants.expoConfig?.extra?.appVariant === 'development' || USE_DEMO_DATA;
