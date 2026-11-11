import { getSupabase } from '@/lib/supabase';
import { backendLifecycle } from '@/lib/request-lifecycle';
import { validGeoapifyArea, type GeoapifyArea } from '../../../shared/geoapify-area-data';

export async function predictSearchAreas(query: string, signal?: AbortSignal, localitiesOnly = false): Promise<GeoapifyArea[]> {
  if (query.trim().length < 3) return [];
  const boundary = backendLifecycle.capture();
  const response = await getSupabase().functions.invoke('search-areas', {body: {query: query.trim(), ...(localitiesOnly ? {localitiesOnly:true} : {})}, signal});
  boundary.assertCurrent();
  if (signal?.aborted) throw Object.assign(Error('Cancelled'), {name: 'AbortError'});
  if (response.error) throw Error('Nie udało się pobrać obszarów.');
  const areas = response.data?.areas;
  if (!Array.isArray(areas) || areas.length > 8 || !areas.every(validGeoapifyArea) || (localitiesOnly && areas.some(area => area.kind !== 'locality'))) throw Error('Niepoprawne obszary.');
  return areas;
}
