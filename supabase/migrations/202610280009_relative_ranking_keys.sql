-- Dev first. Canonicalize location inputs relative to the complete source set.
-- Different unknown IDs/names have exactly the same matching contribution;
-- keeping their raw text in the hash key prevents reuse and spills wide rows.
-- 0 means absent, -1 means present but not in the source dictionary, positive
-- values identify exact equal normalized values within this request only.
-- Keep raw-region presence separately: empty and whitespace-only regions can
-- normalize equally but only nonempty regions contribute the region term.
-- No global cache, candidate limit, approximate match or scoring rule change.
-- Dates are intersected with the envelope of all source windows (including
-- search tolerance). Every shifted source interval lies inside that envelope,
-- so clipping a target to it preserves every possible overlap exactly. Targets
-- wholly before/after it become zero-length intervals at its boundary.
create type discovery_private.relative_score_target as (
  start_date date,end_date date,place_id integer,place_name integer,place_region integer,has_region boolean,
  landscape text,kind text,travel_mode text,hobby_mask integer,age_mask integer,animal_mask integer,
  other_points numeric,other_weight integer
);

create or replace function public.search_public_trips(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode=force_custom_plan as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context;
  result jsonb; after_at timestamptz; after_id uuid; after_score integer; query_key text:=md5(me::text||f::text||sort_mode);
begin
  if sort_mode is null or sort_mode not in('default','compatibility') or page_size is null or page_size<1 or page_size>20 then raise exception 'Invalid sorting or page size' using errcode='22023'; end if;
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object' or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'sort' is distinct from sort_mode or after_cursor->>'id' is null or after_cursor->>'published_at' is null then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;after_at:=(after_cursor->>'published_at')::timestamptz;
      after_score:=(after_cursor->>'score')::int;
      if not isfinite(after_at) or after_score is null or after_score<0 or after_score>100 then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  ctx:=discovery_private.matching_context(me,f);
  if sort_mode='default' then
    -- Count compact keys; retrieve rows and compute reasons only for the page.
    with eligible as materialized(select t.id,t.published_at from discovery_private.candidates(f,me) t),
    page as materialized(
      select e.* from eligible e where after_id is null or e.published_at<after_at or (e.published_at=after_at and e.id>after_id)
      order by e.published_at desc,e.id limit page_size+1
    ), visible as materialized(
      select p.*,discovery_private.score(t,g,ctx,f) as compatibility
      from (select * from page order by published_at desc,id limit page_size) p
      join public.trip_plans t on t.id=p.id join public.travel_groups g on g.id=t.group_id
    ) select jsonb_build_object(
      'items',coalesce((select jsonb_agg(jsonb_build_object('trip',projection.trip,'crew',projection.crew,'compatibility',v.compatibility) order by v.published_at desc,v.id)
        from visible v cross join lateral public.list_public_trips(v.id) projection),'[]'),
      'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from page),
      'cursor',(select jsonb_build_object('id',v.id,'published_at',v.published_at,'score',(v.compatibility->>'score')::int,'sort',sort_mode,'query_key',query_key)
        from visible v order by v.published_at,v.id desc limit 1)) into result;
    return result;
  end if;

  with source_values as materialized(
    select o.id is not null as has_plan,o.location_id,o.location_name,o.location_region,o.landscape,
      messaging_private.search_text(o.location_name) as normalized_name,messaging_private.search_text(o.location_region) as normalized_region,
      coalesce((f->>'start_date')::date,o.start_date) as d1,coalesce((f->>'end_date')::date,o.end_date) as d2,
      case when f->>'start_date' is not null then coalesce((f->>'tolerance_days')::int,0) else 0 end as tolerance,
      case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end as hobbies,
      case when coalesce(jsonb_array_length(f->'child_age_bands'),0)>0 then array(select jsonb_array_elements_text(f->'child_age_bands'))
        when o.id is not null then o.matching_child_age_bands else (ctx.preferences).child_age_bands end as ages,
      case when coalesce(jsonb_array_length(f->'group_kinds'),0)>0 then array(select jsonb_array_elements_text(f->'group_kinds'))
        when o.id is not null then o.matching_group_kinds else (ctx.preferences).group_kinds end as kinds,
      coalesce(o.travel_mode,(ctx.crew).travel_mode) as travel_mode,
      case when o.id is not null then o.animal_kinds else (ctx.crew).animal_kinds end as animals
    from unnest(ctx.trips) o
  ), locations as materialized(
    -- The source set is request-local and unbounded. Arrays avoid a fixed-size
    -- bit mask or any truncation of the viewer's own plans.
    select array_agg(distinct location_id) filter(where has_plan and location_id<>'') as ids,
      array_agg(distinct normalized_name) filter(where has_plan and location_name<>'') as names,
      array_agg(distinct normalized_region) filter(where has_plan) as regions from source_values
  ), sources as materialized(
    select s.*,coalesce(array_position(l.ids,s.location_id),0) as place_id,
      coalesce(array_position(l.names,s.normalized_name),0) as place_name,
      coalesce(array_position(l.regions,s.normalized_region),0) as place_region,
      discovery_private.tag_mask(hobbies,'interest') as hobby_mask,cardinality(hobbies) as hobby_count,
      discovery_private.tag_mask(ages,'age') as age_mask,cardinality(ages) as age_count,
      discovery_private.tag_mask(animals,'animal') as animal_mask,cardinality(animals) as animal_count,
      (case when d1 is not null and d2>d1 then 30 else 0 end)+(case when has_plan then 30 else 0 end)
        +(case when cardinality(hobbies)>0 then 20 else 0 end)+(case when cardinality(ages)>0 then 15 else 0 end)
        +(case when cardinality(kinds)>0 then 10 else 0 end)+(case when cardinality(animals)>0 then 5 else 0 end)+5 as weight
    from source_values s cross join locations l
  ), requirements as materialized(
    select bool_or(has_plan) as place,bool_or(d1 is not null and d2>d1) as dates,
      bool_or(hobby_count>0) as hobby,bool_or(age_count>0) as age,bool_or(animal_count>0) as animal,
      bool_or(cardinality(kinds)>0) as kind,
      min(d1-tolerance) filter(where d1 is not null and d2>d1) as window_start,
      max(d2+tolerance) filter(where d1 is not null and d2>d1) as window_end from sources
  ), target_values as not materialized(
    -- Omit inputs no source uses from the score key. The typed composite's
    -- equality/hash compares NULL fields consistently; no shared global cache.
    select t.id,t.published_at,
      case when r.dates then least(r.window_end,greatest(r.window_start,t.start_date)) end as start_date,
      case when r.dates then least(r.window_end,greatest(r.window_start,t.end_date)) end as end_date,
      case when not r.place or t.location_id='' then 0 else coalesce(array_position(l.ids,t.location_id),-1) end as place_id,
      case when not r.place or t.location_name='' then 0 else coalesce(array_position(l.names,messaging_private.search_text(t.location_name)),-1) end as place_name,
      case when r.place then coalesce(array_position(l.regions,messaging_private.search_text(t.location_region)),-1) else 0 end as place_region,
      r.place and t.location_region<>'' as has_region,
      case when r.place then t.landscape else '' end as landscape,
      case when r.kind then g.kind else '' end as kind,coalesce(t.travel_mode,g.travel_mode) as travel_mode,
      case when r.hobby then discovery_private.tag_mask(t.interests,'interest') else 0 end as hobby_mask,
      case when r.age then discovery_private.tag_mask(g.child_age_bands,'age') else 0 end as age_mask,
      case when r.animal then discovery_private.tag_mask(t.animal_kinds,'animal') else 0 end as animal_mask,
      coalesce((case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int*10 end),0)
        +coalesce((case when cardinality(t.matching_child_age_bands)>0 then
          bit_count((discovery_private.tag_mask(t.matching_child_age_bands,'age') & discovery_private.tag_mask((ctx.crew).child_age_bands,'age'))::bit(32))::numeric/cardinality(t.matching_child_age_bands)*10 end),0) as other_points,
      (case when cardinality(t.matching_group_kinds)>0 then 10 else 0 end)
        +(case when cardinality(t.matching_child_age_bands)>0 then 10 else 0 end) as other_weight
    from discovery_private.candidates(f,me) t join public.travel_groups g on g.id=t.group_id cross join requirements r cross join locations l
  ), eligible as materialized(
    select id,published_at,row(start_date,end_date,place_id,place_name,place_region,has_region,landscape,
      kind,travel_mode,hobby_mask,age_mask,animal_mask,other_points,other_weight)::discovery_private.relative_score_target as features
    from target_values
  ), unique_targets as materialized(
    select distinct features from eligible
  ), feature_scores as materialized(
    select e.features,(select max(coalesce(round(100*(
      coalesce((case when s.d1 is not null and s.d2>s.d1 then
        greatest(0,least((e.features).end_date-(e.features).start_date,s.d2-s.d1,(e.features).end_date-(s.d1-s.tolerance),(s.d2+s.tolerance)-(e.features).start_date))::numeric/(s.d2-s.d1)*30 end),0)
      +case when s.has_plan then (case when
        case when s.location_id<>'' and (e.features).place_id<>0 then s.place_id=(e.features).place_id else
          s.location_name<>'' and (e.features).place_name>0 and s.place_name=(e.features).place_name and s.place_region=(e.features).place_region end
        then 1 when s.location_region<>'' and (e.features).has_region and s.place_region=(e.features).place_region then 0.7 else 0 end)*20
        +coalesce((s.landscape=(e.features).landscape)::int*10,0) else 0 end
      +coalesce((case when s.hobby_count>0 then bit_count((s.hobby_mask & (e.features).hobby_mask)::bit(32))::numeric/s.hobby_count*20 end),0)
      +coalesce((case when s.age_count>0 then bit_count((s.age_mask & (e.features).age_mask)::bit(32))::numeric/s.age_count*15 end),0)
      +coalesce((case when cardinality(s.kinds)>0 then ((e.features).kind=any(s.kinds))::int*10 end),0)
      +coalesce(((e.features).travel_mode=s.travel_mode)::int*5,0)
      +coalesce((case when s.animal_count>0 then bit_count((s.animal_mask & (e.features).animal_mask)::bit(32))::numeric/s.animal_count*5 end),0)
      +(e.features).other_points)/nullif(s.weight+(e.features).other_weight,0)),0)::integer) from sources s) as score
    from unique_targets e
  ), ranked as not materialized(
    select e.id,e.published_at,s.score from eligible e join feature_scores s on s.features=e.features
  ), page as materialized(
    select r.* from ranked r where after_id is null or r.score<after_score
      or (r.score=after_score and (r.published_at<after_at or (r.published_at=after_at and r.id>after_id)))
    order by r.score desc,r.published_at desc,r.id limit page_size+1
  ), visible as materialized(
    -- The legacy scorer chooses the first own plan in a score tie and retains
    -- its reason order. Only five/twenty projected winners need that detail.
    select p.*,discovery_private.score(t,g,ctx,f) as compatibility
    from (select * from page order by score desc,published_at desc,id limit page_size) p
    join public.trip_plans t on t.id=p.id join public.travel_groups g on g.id=t.group_id
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('trip',projection.trip,'crew',projection.crew,'compatibility',v.compatibility) order by v.score desc,v.published_at desc,v.id)
      from visible v cross join lateral public.list_public_trips(v.id) projection),'[]'),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('id',v.id,'published_at',v.published_at,'score',v.score,'sort',sort_mode,'query_key',query_key)
      from visible v order by v.score,v.published_at,v.id desc limit 1)) into result;
  return result;
end $$;

notify pgrst,'reload schema';
