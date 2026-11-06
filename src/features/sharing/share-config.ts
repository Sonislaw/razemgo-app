import Constants from 'expo-constants';
import type { SharingScheme } from './share-links';

const variant = Constants.expoConfig?.extra?.appVariant;
export const SHARING_ENABLED = variant === 'development' || variant === 'preview';
export const SHARING_SCHEME: SharingScheme = variant === 'preview' ? 'razemgo' : 'razemgo-dev';
