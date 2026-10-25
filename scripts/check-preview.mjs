import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { previewConfigurationErrors } from './preview-config.cjs';

const require = createRequire(import.meta.url);
async function main() {
  const args = process.argv.slice(2);
  const file = args.find(arg => !arg.startsWith('--')) ?? '.env.preview.local';
  const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.preview;
  if (profile.developmentClient !== false || profile.distribution !== 'internal' || profile.android?.buildType !== 'apk' || profile.environment !== 'preview') {
    throw new Error('Profil preview musi budować samodzielny APK w środowisku preview.');
  }
  // An explicitly selected file wins over the developer's shell configuration.
  const env = { ...process.env, ...parseEnv(readFileSync(file, 'utf8')), ...profile.env };
  const baseConfig = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  let config;
  const previous = { ...process.env };
  try {
    Object.assign(process.env, env, { EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'preview' });
    config = require('../app.config.js')({ config: baseConfig });
  } finally { process.env = previous; }
  let firebase;
  try { firebase = JSON.parse(readFileSync(env.GOOGLE_SERVICES_JSON || 'google-services.json', 'utf8')); } catch { /* Fixed error from validation. */ }
  const errors = previewConfigurationErrors(env, config, firebase);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('OK: samodzielny APK, konfiguracja Supabase, Firebase, Google callback i Sentry preview.');
  if (args.includes('--online')) {
    const response = await fetch(new URL('/auth/v1/settings', env.EXPO_PUBLIC_SUPABASE_URL), {
      headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Supabase Auth: HTTP ' + response.status);
    const settings = await response.json();
    if (!settings.external?.google || !settings.external?.email || settings.disable_signup) throw new Error('Supabase: sprawdź Google, e-mail i możliwość rejestracji.');
    console.log('OK: Supabase odpowiada; Google, e-mail i rejestracja są włączone.');
  }
}
main().catch(error => {
  // Do not print fetch causes, response bodies, URLs or environment contents.
  console.error(error instanceof TypeError ? 'Nie udało się wykonać kontroli online Supabase.' : error.message);
  process.exitCode = 1;
});
