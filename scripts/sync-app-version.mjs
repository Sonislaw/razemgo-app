import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw Error('Unknown version command argument');
const packageUrl = new URL('../package.json', import.meta.url);
const appUrl = new URL('../app.json', import.meta.url);
const packageData = JSON.parse(await readFile(packageUrl, 'utf8'));
const appData = JSON.parse(await readFile(appUrl, 'utf8'));
const version = packageData.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) || !appData.expo)
  throw Error('Invalid application version configuration');

if (args.includes('--check')) {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  if (appData.expo.version !== version || lock.version !== version || lock.packages?.['']?.version !== version)
    throw Error('Application versions differ. Use npm run version:patch, version:minor or version:major.');
  console.log('OK: app.json, package.json i package-lock.json — wersja ' + version);
} else {
  appData.expo.version = version;
  await writeFile(appUrl, JSON.stringify(appData, null, 2) + '\n');
  console.log('Wersja aplikacji: ' + version);
}
