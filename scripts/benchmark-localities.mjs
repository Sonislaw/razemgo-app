import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const dictionary = require.resolve('../src/data/locations/polish-localities.json');
const started = performance.now();
const { findTripLocation, searchTripLocations } = await import('../src/features/trips/trip-locations.ts');
const importMs = performance.now() - started;
const timed = (action) => {
  const start = performance.now();
  action();
  return performance.now() - start;
};
const countryMs = timed(() => findTripLocation('country:PL'));
const provinceMs = timed(() => findTripLocation('pl-region:pomorskie'));
const shortQueryMs = timed(() => searchTripLocations('x'));
const dictionaryLoadedAfterSmallLookups = !!require.cache[dictionary];
const firstConcreteLookupMs = timed(() => findTripLocation('pl-locality:4259'));
const queries = {};
for (const query of ['gdansk','pomorskie','nowa wies','ka','chlapowo pucki']) {
  const firstMs = timed(() => searchTripLocations(query));
  const samples = Array.from({length: 200}, () => timed(() => searchTripLocations(query))).sort((a,b) => a-b);
  queries[query] = {firstMs,cachedMedianMs:samples[100],cachedP95Ms:samples[190]};
}
console.log(JSON.stringify({runtime:process.version,importMs,countryMs,provinceMs,shortQueryMs,
  dictionaryLoadedAfterSmallLookups,firstConcreteLookupMs,queries},null,2));
