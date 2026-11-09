-- Keep the V3 signature and default publication order for existing clients.
-- Sorting is a search option, separate from saved criteria and map queries.
create or replace function public.search_public_trips_v3(filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters);
  ordering text:=coalesce(f->>'sort_order','newest');
  query_key text; after_id uuid; after_at timestamptz; after_start date; after_day integer:=0; result jsonb;
begin
  if page_size is null or page_size<1 or page_size>20 then
    raise exception 'Invalid page size' using errcode='22023'; end if;
  if ordering not in('newest','date_asc','date_desc')
    or f ? 'sort_order' and jsonb_typeof(f->'sort_order') is distinct from 'string' then
    raise exception 'Invalid sort order' using errcode='22023'; end if;
  query_key:=md5('discovery:3:'||me::text||f::text);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object'
        or after_cursor->>'version' is distinct from '3'
        or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'id' is null or after_cursor->>'published_at' is null then
        raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;
      after_at:=(after_cursor->>'published_at')::timestamptz;
      if not isfinite(after_at) then raise exception 'Invalid cursor'; end if;
      if ordering<>'newest' then
        if jsonb_typeof(after_cursor->'start_date') is distinct from 'string'
          or after_cursor->>'start_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid cursor'; end if;
        after_start:=(after_cursor->>'start_date')::date;
        if not isfinite(after_start) then raise exception 'Invalid cursor'; end if;
        after_day:=case ordering when 'date_asc' then after_start-date '2000-01-01' else date '2000-01-01'-after_start end;
      end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with eligible as materialized (
    select t.id,t.published_at,t.start_date,
      case ordering when 'date_asc' then t.start_date-date '2000-01-01'
        when 'date_desc' then date '2000-01-01'-t.start_date else 0 end as sort_day
    from discovery_private.candidates(f,me) t
  ), matched as materialized (
    select * from eligible where after_id is null or sort_day>after_day
      or sort_day=after_day and (published_at<after_at or published_at=after_at and id>after_id)
    order by sort_day,published_at desc,id limit page_size+1
  ), page as materialized (
    select * from matched order by sort_day,published_at desc,id limit page_size
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by t.sort_day,t.published_at desc,t.id)
      from page t cross join lateral public.list_public_trips(t.id) p),'[]'),
    'result_revision',(select md5(coalesce(string_agg(id::text||published_at::text||
      case when ordering='newest' then '' else start_date::text end,',' order by id),'')) from eligible),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'version',3,'query_key',query_key)
      ||case when ordering='newest' then '{}'::jsonb else jsonb_build_object('start_date',start_date) end
      from page order by sort_day desc,published_at,id desc limit 1)) into result;
  return result;
end $$;

notify pgrst,'reload schema';
