// Never include values in errors: a bad config may contain a server credential.
function isPublicSupabaseKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key ?? '')) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key ?? '')) return false;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch { return false; }
}

function previewConfigurationErrors(env, config, firebase) {
  const errors = [];
  try {
    const url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['', '/'].includes(url.pathname) || /^(localhost|127\.|\[?::1)/i.test(url.hostname)) throw new Error();
  } catch { errors.push('EXPO_PUBLIC_SUPABASE_URL must be a public HTTPS origin'); }

  if (!isPublicSupabaseKey(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key');
  if (!/^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+\/\d+$/.test(env.EXPO_PUBLIC_SENTRY_DSN ?? '')) errors.push('EXPO_PUBLIC_SENTRY_DSN is missing or invalid');
  if (env.EXPO_PUBLIC_APP_ENV !== 'preview') errors.push('EXPO_PUBLIC_APP_ENV must be preview');
  if (env.EXPO_PUBLIC_ENABLE_DEMO !== 'false') errors.push('EXPO_PUBLIC_ENABLE_DEMO must be false');
  if (env.EXPO_PUBLIC_MONITORING_IN_DEV !== 'false') errors.push('EXPO_PUBLIC_MONITORING_IN_DEV must be false');
  if (config.scheme !== 'razemgo') errors.push('The Google auth return scheme must remain razemgo');
  if (!/^[a-f\d-]{36}$/i.test(config.extra?.eas?.projectId ?? '')) errors.push('The EAS project ID for push is missing');
  if (!firebase?.project_info?.project_number || !firebase.client?.some(client => client.client_info?.android_client_info?.package_name === config.android?.package)) {
    errors.push('GOOGLE_SERVICES_JSON must contain the Android app configuration for this package');
  }
  return errors;
}
module.exports = { previewConfigurationErrors, isPublicSupabaseKey };
