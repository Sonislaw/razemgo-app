import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  compactLocalities,
  LOCALITY_AS_OF,
  LOCALITY_COMMIT,
  LOCALITY_REPOSITORY,
} from './locality-data.mjs';

const base = `https://raw.githubusercontent.com/jjbartek/polskie-miejscowosci/${LOCALITY_COMMIT}/`;
const offline = process.argv.includes('--offline');
const [source, license] = await Promise.all(
  ['data.json', 'LICENSE'].map(async (name) => {
    if (offline)
      return readFileSync(
        new URL(`../.expo/locality-import/${name}`, import.meta.url),
        'utf8',
      );
    const response = await fetch(base + name);
    if (!response.ok)
      throw new Error(`Pobieranie ${name}: HTTP ${response.status}`);
    return response.text();
  }),
);
const data = compactLocalities(JSON.parse(source));
const target = new URL('../src/data/locations/', import.meta.url);
mkdirSync(target, { recursive: true });
writeFileSync(
  new URL('polish-localities.json', target),
  JSON.stringify(data) + '\n',
  'utf8',
);
writeFileSync(
  new URL('polish-localities-license.txt', target),
  license,
  'utf8',
);
writeFileSync(
  new URL('polish-localities-source.json', target),
  JSON.stringify(
    {
      repository: LOCALITY_REPOSITORY,
      author: 'jjbartek',
      commit: LOCALITY_COMMIT,
      asOf: LOCALITY_AS_OF,
      count: data.places.length,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      licenseFile: base + 'LICENSE',
      packageLicenseIdentifier: 'CC-BY-1.0',
      transformation:
        'Dictionary encoded Province, District and Commune; locality fields preserved as tuples.',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log(
  `Zapisano ${data.places.length} miejscowości i ${data.provinces.length} województw (stan: ${LOCALITY_AS_OF}).`,
);
