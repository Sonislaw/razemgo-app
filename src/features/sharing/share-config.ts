import Constants from 'expo-constants';

export const DEV_SHARING_ENABLED = Constants.expoConfig?.extra?.appVariant === 'development';
