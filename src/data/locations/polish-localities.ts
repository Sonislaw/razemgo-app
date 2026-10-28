import { loadDictionary } from './locality-dictionary.cjs';
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
export interface LocalityData {
  provinces: readonly string[];
  districts: readonly string[];
  communes: readonly string[];
  places: readonly LocalityRow[];
  prefixes: Readonly<Record<string, readonly number[]>>;
}
// The importer validates the original data before producing this compact snapshot.
export function getLocalities(): LocalityData {
  return loadDictionary() as LocalityData;
}
// Compatibility for map helpers and data tests. Creating the proxy is cheap;
// accessing dictionary content performs the deferred load once.
export const POLISH_LOCALITIES: LocalityData = new Proxy({} as LocalityData, {
  get: (_target, property: keyof LocalityData) => getLocalities()[property],
});
export const LOCALITY_SOURCE = source;
