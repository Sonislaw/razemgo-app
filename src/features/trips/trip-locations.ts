import { getLocalities } from '../../data/locations/polish-localities.ts';
import { SUPPLEMENTARY_LOCATIONS } from '../../data/locations/supplementary.ts';
import type { LocationOption } from '../../types/location';
import type { TripMode, TripPlace } from '../../types/travel';

export const LOCATION_KIND_LABELS: Record<LocationOption['kind'], string> = {
  locality: 'Miejscowość',
  city: 'Miasto',
  village: 'Wieś',
  region: 'Region',
  country: 'Kraj',
};
export const TRIP_LOCATION_REQUIRED_ERROR =
  'Wybierz lokalizację z podpowiedzi — miejscowość, region lub kraj.';
export const PLANNED_TRIP_LOCATION_REQUIRED_ERROR =
  'W trybie „Mam plan” wybierz miasto lub wieś z podpowiedzi.';

export function isConcreteTripLocation(location?: LocationOption): boolean {
  return !!location && ['locality', 'city', 'village'].includes(location.kind);
}

export function isLocationAllowedForTrip(
  location: LocationOption,
  mode: TripMode,
): boolean {
  return mode === 'flexible' || isConcreteTripLocation(location);
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
const normalizeRegion = (value: string) =>
  normalize(value).replace(/\bpomorze\b/gu, 'pomorskie');

export const MAX_LOCATION_SUGGESTIONS = 10;
export const MIN_LOCATION_QUERY_LENGTH = 2;
const resolved = new Map<string, LocationOption>();
const legacyIds = new Map([
  ['demo-location-chlapowo', 'pl-locality:4259'],
  ['demo-location-gdansk', 'pl-locality:8457'],
  ['demo-location-polska', 'country:PL'],
]);
const baseSupplementary: LocationOption[] = [
  ...SUPPLEMENTARY_LOCATIONS.filter((item) => !legacyIds.has(item.id)).map(
    (item) => ({
      ...item,
      region: item.id === 'demo-location-kaszuby' ? 'pomorskie' : item.region,
      source: 'demo' as const,
    }),
  ),
  {
    id: 'country:PL',
    name: 'Polska',
    region: '',
    country: 'Polska',
    kind: 'country',
    source: 'country',
  },
];
function createLocationIndex() {
  const data = getLocalities();
  const rows = data.places;
  const rowById = new Map(rows.map((row) => [row[0], row]));
  const supplementary: LocationOption[] = [
    ...baseSupplementary,
    ...data.provinces.map(
      (province): LocationOption => ({
        id: 'pl-region:' + province,
        name: province[0].toLocaleUpperCase('pl-PL') + province.slice(1),
        region: '',
        country: 'Polska',
        kind: 'region',
        source: 'derived-region',
      }),
    ),
  ];
  const supplementaryById = new Map(
    supplementary.map((item) => [item.id, item]),
  );
  return {
    data,
    rows,
    rowById,
    supplementary,
    supplementaryById,
    provinces: data.provinces.map(
      (province) =>
        normalize(province) + (province === 'pomorskie' ? ' pomorze' : ''),
    ),
    counties: data.districts.map(normalize),
    communes: data.communes.map((commune) =>
      normalize(commune.replace(/-gmina .+$/u, '')),
    ),
  };
}
let index: ReturnType<typeof createLocationIndex> | undefined;
const locationIndex = () => (index ??= createLocationIndex());
const collator = new Intl.Collator('pl', {
  sensitivity: 'base',
  numeric: true,
});
interface SearchEntry {
  id: string;
  name: string;
  text: string;
  priority: number;
}
const searchEntries = new Map<number, SearchEntry>();
const extraEntry = (item: LocationOption): SearchEntry => ({
  id: item.id,
  name: normalize(item.name),
  text: normalize(
    [item.name, item.region, item.country, ...(item.aliases ?? [])].join(' '),
  ),
  priority: item.kind === 'country' ? 2 : 1,
});
function entryForRow(index: number): SearchEntry {
  const { rows, provinces, counties, communes } = locationIndex();
  const cached = searchEntries.get(index);
  if (cached) return cached;
  const row = rows[index];
  const entry = {
    id: 'pl-locality:' + row[0],
    name: row[8],
    text: `${row[8]} ${provinces[row[3]]} ${counties[row[4]]} ${communes[row[5]]} polska`,
    priority: row[2] === 1 ? 0 : 1,
  };
  searchEntries.set(index, entry);
  return entry;
}

export function findTripLocation(id?: string): LocationOption | undefined {
  if (!id) return undefined;
  const canonicalId = legacyIds.get(id) ?? id;
  const { supplementaryById, rowById, data } = locationIndex();
  const extra = supplementaryById.get(canonicalId);
  if (extra) return extra;
  if (resolved.has(canonicalId)) return resolved.get(canonicalId);
  const row = canonicalId.startsWith('pl-locality:')
    ? rowById.get(canonicalId.slice('pl-locality:'.length))
    : undefined;
  if (!row) return undefined;
  const location: LocationOption = {
    id: canonicalId,
    name: row[1],
    kind: row[2] === 1 ? 'city' : 'village',
    region: data.provinces[row[3]],
    county: data.districts[row[4]],
    commune: data.communes[row[5]].replace(/-gmina .+$/u, ''),
    latitude: row[6],
    longitude: row[7],
    country: 'Polska',
    source: 'polish-localities',
  };
  resolved.set(canonicalId, location);
  return location;
}

export function searchTripLocations(
  query: string,
  mode: TripMode = 'flexible',
): LocationOption[] {
  const { data, supplementary } = locationIndex();
  const supplementaryEntries = supplementary.map(extraEntry);
  const value = normalize(query)
    .replace(/[,.;]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!value)
    return [
      'country:PL',
      'pl-locality:8457',
      'pl-locality:4259',
      'demo-location-kaszuby',
      'demo-location-slowenia',
    ]
      .map((id) => findTripLocation(id)!)
      .filter((location) => isLocationAllowedForTrip(location, mode));
  if (value.length < MIN_LOCATION_QUERY_LENGTH) return [];
  if (value === 'polska' && mode === 'flexible')
    return [findTripLocation('country:PL')!];
  const terms = value.split(' ');
  const buckets = terms
    .filter(
      (term) => term.length >= 2 && (term !== 'polska' || terms.length === 1),
    )
    .map((term) => data.prefixes[term.slice(0, 2)] ?? []);
  const candidates = buckets.length
    ? buckets.reduce((smallest, bucket) =>
        bucket.length < smallest.length ? bucket : smallest,
      )
    : [];
  const best: { entry: SearchEntry; score: number }[] = [];
  const compare = (a: (typeof best)[number], b: (typeof best)[number]) =>
    a.score - b.score ||
    a.entry.priority - b.entry.priority ||
    collator.compare(a.entry.name, b.entry.name) ||
    collator.compare(a.entry.text, b.entry.text) ||
    a.entry.id.localeCompare(b.entry.id);
  for (const entry of [
    ...candidates.map(entryForRow),
    ...supplementaryEntries.filter((entry) =>
      isLocationAllowedForTrip(findTripLocation(entry.id)!, mode),
    ),
  ]) {
    if (!terms.every((term) => entry.text.includes(term))) continue;
    const score =
      entry.name === value
        ? 0
        : entry.name.startsWith(value)
          ? 1
          : terms.every((term) => entry.name.includes(term))
            ? 2
            : terms.some((term) => entry.name.includes(term))
              ? 3
              : 4;
    const candidate = { entry, score };
    if (
      best.length === MAX_LOCATION_SUGGESTIONS &&
      compare(candidate, best[best.length - 1]) >= 0
    )
      continue;
    const index = best.findIndex((item) => compare(candidate, item) < 0);
    best.splice(index === -1 ? best.length : index, 0, candidate);
    if (best.length > MAX_LOCATION_SUGGESTIONS) best.pop();
  }
  return best.map(({ entry }) => findTripLocation(entry.id)!);
}

export function locationContext(location: LocationOption): string {
  return location.kind === 'country'
    ? 'Cały kraj'
    : [
        location.commune && location.commune !== location.name
          ? 'gm. ' + location.commune
          : '',
        location.county && location.county !== location.name
          ? 'pow. ' + location.county
          : '',
        location.region,
        location.country,
      ]
        .filter(Boolean)
        .join(', ');
}

export function tripLocationIdForPlace(place: TripPlace): string {
  const selected = findTripLocation(place.locationId);
  if (selected) return selected.id;
  const old = SUPPLEMENTARY_LOCATIONS.find(
    (location) =>
      normalize(location.name) === normalize(place.name) &&
      normalizeRegion(location.region) === normalizeRegion(place.region),
  );
  if (old) return findTripLocation(old.id)?.id ?? '';
  const candidates = searchTripLocations(
    [place.name, place.region].join(' '),
  ).filter(
    (item) =>
      normalize(item.name) === normalize(place.name) &&
      normalizeRegion(item.region) === normalizeRegion(place.region),
  );
  return candidates.length === 1 ? candidates[0].id : '';
}
