const fs = require('node:fs');
const { previewConfigurationErrors, isPublicSupabaseKey } = require('./scripts/preview-config.cjs');
const { variants, getAppVariant, assertBackendIsolation } = require('./config/app-variants.cjs');

module.exports = ({ config }) => {
  const variant = getAppVariant(process.env);
  const settings = variants[variant];
  assertBackendIsolation(variant, process.env.EXPO_PUBLIC_SUPABASE_URL);
  // EAS supports a file environment variable; local builds can use an ignored
  // google-services.json. The rest of the app works before Firebase is configured.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(settings.firebaseFile) ? './' + settings.firebaseFile : undefined);
  const resolved = {
    ...config,
    name: settings.name,
    scheme: settings.scheme,
    ios: { ...config.ios, bundleIdentifier: settings.package },
    android: { ...config.android, package: settings.package, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, appVariant: variant, authScheme: settings.scheme },
  };
  // Validate the actual cloud environment, where secret file variables exist.
  // Do not stop local Expo startup or the CLI's initial project discovery.
  if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PROFILE === 'preview') {
    let firebase;
    try { firebase = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8')); } catch { /* Report only a fixed configuration error below. */ }
    const errors = previewConfigurationErrors(process.env, resolved, firebase);
    if (errors.length) throw new Error('Preview configuration: ' + errors.join('; '));
  }
  if (process.env.EAS_BUILD === 'true' && variant === 'development') {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || !isPublicSupabaseKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
      throw new Error('Configure the separate Dev Supabase URL and public key before building.');
    }
    let firebase;
    try { firebase = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8')); } catch { /* Fixed error below. */ }
    if (!firebase?.client?.some(client => client.client_info?.android_client_info?.package_name === settings.package)) {
      throw new Error('Development needs its own Firebase Android app configuration.');
    }
  }
  return resolved;
};
