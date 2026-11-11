import type {PlacePrediction, SelectedPlace} from '../../types/place';

export function createPlaceQueryCache(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1) throw Error('Invalid prediction cache limit');
  const entries = new Map<string, PlacePrediction[]>();
  let session = '';
  const key = (query: string, mode: string) => JSON.stringify([query.trim().toLocaleLowerCase('pl-PL'), mode]);
  function selectSession(token: string) {if (session !== token) {entries.clear(); session = token;}}
  return {
    get(token: string, query: string, mode: string) {
      selectSession(token); const id = key(query, mode), value = entries.get(id);
      if (value !== undefined) {entries.delete(id); entries.set(id, value);}
      return value;
    },
    set(token: string, query: string, mode: string, value: PlacePrediction[]) {
      selectSession(token); const id = key(query, mode);
      entries.delete(id); entries.set(id, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
  };
}
export function sameManualAddress(previous: SelectedPlace | undefined, current: SelectedPlace) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
  return previous?.source === 'manual' && current.source === 'manual' && !!previous.googlePlaceId &&
    (['address', 'region', 'country'] as const).every(field => !!current[field].trim() && normalize(previous[field]) === normalize(current[field]));
}
