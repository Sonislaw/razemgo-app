import { readFile } from 'node:fs/promises';

// Restore only these RPC bodies in the disposable local stack. Other migrations,
// grants and role settings remain identical for the before/after measurement.
export async function rankingDefinition(previous = false) {
  let definitions = '';
  for (const name of ['search_public_trips', 'list_ranked_public_groups', 'list_public_trips']) {
    const file = !previous ? '202610280009_relative_ranking_keys.sql' : name === 'list_public_trips'
      ? '202610250011_crew_numbers.sql' : '202610280008_discovery_ranking_cost.sql';
    const source = await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8');
    const start = source.indexOf('create or replace function public.' + name + '(');
    const end = source.indexOf('$$;', start) + 3;
    if (start < 0 || end <= start) throw Error('Ranking definition missing');
    definitions += source.slice(start, end) + '\n';
  }
  return definitions + `
    alter function public.search_public_trips(jsonb,text,jsonb,integer) set plan_cache_mode=force_custom_plan;
    alter function public.list_ranked_public_groups(jsonb,text,jsonb,integer) set plan_cache_mode=force_custom_plan;`;
}
