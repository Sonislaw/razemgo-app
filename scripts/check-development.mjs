import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const file = process.argv[2] ?? '.env.local';
  const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.development;
  if (!profile.developmentClient || profile.environment !== 'development') throw new Error('Niepoprawny profil EAS development.');
  const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const previous = { ...process.env };
  try {
    Object.assign(process.env, parseEnv(readFileSync(file, 'utf8')), profile.env, { EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'development' });
    require('../app.config.js')({ config });
  } finally { process.env = previous; }
  console.log('OK: osobna aplikacja Dev, osobny Supabase, callback i konfiguracja Firebase.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
