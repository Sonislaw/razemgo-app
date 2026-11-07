import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compactCampgrounds } from './campground-data.mjs';

const endpoint = 'https://overpass-api.de/api/interpreter';
const query = '[out:json][timeout:90];area["ISO3166-1"="PL"]["admin_level"="2"]->.pl;nwr["tourism"~"^(camp_site|caravan_site)$"](area.pl);out center tags;';
const cache = new URL('../.expo/campground-import/', import.meta.url);
mkdirSync(cache, { recursive: true });
let raw;
if (process.argv.includes('--offline')) raw = readFileSync(new URL('osm.json', cache), 'utf8');
else {
  console.log('Pobieranie katalogu kempingów OSM dla Polski.');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'User-Agent': 'RazemGo-Campground-Import/1.6', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(110000),
  });
  if (!response.ok) throw Error('OSM download: HTTP ' + response.status);
  raw = await response.text();
}
const source = JSON.parse(raw);
const items = compactCampgrounds(source);
if (items.length < 500) throw Error('OSM catalogue is unexpectedly small; previous snapshot preserved');
const metadata = {
  provider: 'OpenStreetMap', country: 'PL', asOf: source.osm3s.timestamp_osm_base,
  count: items.length, withAddress: items.filter(row => row[2]).length,
  endpoint, query, sourceSha256: createHash('sha256').update(raw).digest('hex'),
  license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
  transformation: 'Named active camp_site/caravan_site objects; private/no access excluded. Optional OSM address tags only; coordinates rounded to six decimals.',
};
const directory = new URL('../src/data/campgrounds/', import.meta.url);
mkdirSync(directory, { recursive: true });
const outputs = {
  'polish-campgrounds.json': JSON.stringify(items) + '\n',
  'polish-campgrounds-source.json': JSON.stringify(metadata, null, 2) + '\n',
};
for (const [file, text] of Object.entries(outputs)) {
  const target = new URL(file, directory);
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) throw Error('Campground snapshot differs: ' + file);
  } else writeFileSync(target, text);
}
if (!process.argv.includes('--check')) writeFileSync(new URL('osm.json', cache), raw);
console.log(JSON.stringify({ count: metadata.count, withAddress: metadata.withAddress, asOf: metadata.asOf }));
