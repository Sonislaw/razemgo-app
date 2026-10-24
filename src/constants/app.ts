// Controls preview tools and labels only. Local example data is still used.
export const IS_DEMO_MODE = false;

// Explicit opt-in for local UI preview. Never enabled in release builds.
export const USE_DEMO_DATA = __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true';
export const TRIPS_BACKEND_AVAILABLE = true;
export const MESSAGING_BACKEND_AVAILABLE = USE_DEMO_DATA;
