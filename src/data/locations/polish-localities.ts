import rawData from './polish-localities.json' with { type: 'json' };
import source from './polish-localities-source.json' with { type: 'json' };

export type LocalityRow = readonly [
  id: string,
  name: string,
  isCity: number,
  province: number,
  district: number,
  commune: number,
  latitude: number,
  longitude: number,
  normalizedName: string,
];
interface LocalityData {
  provinces: readonly string[];
  districts: readonly string[];
  communes: readonly string[];
  places: readonly LocalityRow[];
  prefixes: Readonly<Record<string, readonly number[]>>;
}
// The importer validates the original data before producing this compact snapshot.
export const POLISH_LOCALITIES = rawData as unknown as LocalityData;
export const LOCALITY_SOURCE = source;
