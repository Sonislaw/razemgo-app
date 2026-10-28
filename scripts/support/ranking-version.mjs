import { readFile } from 'node:fs/promises';

// Restore only this RPC's body in the disposable local stack. Other migrations,
// grants and role settings remain identical for the before/after measurement.
export async function rankingDefinition(previous = false) {
  const file = previous ? '202610280008_discovery_ranking_cost.sql' : '202610280009_relative_ranking_keys.sql';
  const source = await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8');
  const start = source.indexOf('create or replace function public.search_public_trips(');
  const end = source.indexOf('end $$;', start) + 'end $$;'.length;
  if (start < 0 || end <= start) throw Error('Ranking definition missing');
  return source.slice(start, end) + '\nalter function public.search_public_trips(jsonb,text,jsonb,integer) set plan_cache_mode=force_custom_plan;';
}
