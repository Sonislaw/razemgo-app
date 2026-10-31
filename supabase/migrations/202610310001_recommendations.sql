-- Dev first. V1 reads and scoring remain intact for installed applications.
-- V2 returns factual, public explanations separately from private ranking.
create function discovery_private.recommendation_context(me uuid,f jsonb)
returns discovery_private.match_context language plpgsql stable set search_path='' as $$
declare ctx discovery_private.match_context:=discovery_private.matching_context(me,f);
begin
  if (f->>'start_date' is not null or f->'location'->>'id' is not null or btrim(coalesce(f->>'location_query',''))<>'')
    and not exists(select 1 from unnest(ctx.trips) o where o.id=(f->>'source_trip_id')::uuid) then
    ctx.trips:=array[null::public.trip_plans];
  end if;
  -- Same deterministic source tie-break in SQL and the demonstration adapter.
  select array_agg(o order by o.id) into ctx.trips from unnest(ctx.trips) o;
  return ctx;
end $$;

-- Pure/invoker SQL helpers inline into the caller's fixed empty search_path.
create function discovery_private.plan_signals(t public.trip_plans,o public.trip_plans,f jsonb)
returns table(date_match integer,place_match integer,place_label text) language sql stable as $$
  with parameters as (
    select coalesce((f->>'start_date')::date,o.start_date) as d1,coalesce((f->>'end_date')::date,o.end_date) as d2,
      case when f->>'start_date' is not null then coalesce((f->>'tolerance_days')::int,0) else 0 end as tolerance,
      f->'location'->>'id' is not null as selected,
      btrim(coalesce(f->>'location_query',''))<>'' and messaging_private.search_text(f->>'location_query') not in
        (messaging_private.search_text(coalesce(o.location_region,'')),messaging_private.search_text(coalesce(o.location_name,''))) as changed_query
  ), source as (
    select p.*,case when selected then f->'location'->>'id' when not changed_query then o.location_id end as location_id,
      case when selected then f->'location'->>'name' when not changed_query then o.location_name end as location_name,
      case when selected then f->'location'->>'region' when not changed_query then o.location_region end as location_region,
      case when selected then f->'location'->>'kind' when not changed_query then o.location_kind end as location_kind
    from parameters p
  ), values as (
    select s.*,case when s.location_kind='region' then discovery_private.region_text(s.location_name)
      else discovery_private.region_text(s.location_region) end as source_region,
      case when t.location_kind='region' then discovery_private.region_text(t.location_name)
        else discovery_private.region_text(t.location_region) end as target_region
    from source s
  ) select
    case when d1 is null or d2<=d1 then 0 when greatest(t.start_date,d1)<least(t.end_date,d2) then 2
      when tolerance>0 and t.start_date<d2+tolerance and t.end_date>d1-tolerance then 1 else 0 end,
    case when location_kind is null or location_kind='country' or t.location_kind='country' then 0
      when location_kind in('city','village','locality') and t.location_kind in('city','village','locality')
        and case when coalesce(location_id,'')<>'' and t.location_id<>'' then location_id=t.location_id else
          coalesce(location_name,'')<>'' and messaging_private.search_text(location_name)=messaging_private.search_text(t.location_name)
            and coalesce(source_region,'')=coalesce(target_region,'') end then 2
      when coalesce(source_region,'')<>'' and source_region=target_region then 1 else 0 end,
    case when t.location_kind='region' then t.location_name else t.location_region end
  from values;
$$;

create function discovery_private.recommendation_rank(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb)
returns table(rank integer,source_order integer) language sql stable as $$
  select ((s.date_match>0 and s.place_match>0)::int*1000000+s.date_match*100000+s.place_match*10000+r.score)::int,
    r.pair_order::int
  from discovery_private.score_rows(t,g,ctx,f) r
    cross join lateral discovery_private.plan_signals(t,(ctx.trips)[r.pair_order],f) s
  order by 1 desc,r.pair_order limit 1;
$$;

create function discovery_private.group_recommendation(a public.travel_groups,b public.travel_groups) returns jsonb
language sql stable set search_path='' as $$
  with interests as (select distinct value from unnest(a.interests) value where value=any(b.interests)),
  ages as (select distinct value from unnest(a.child_age_bands) value where a.child_count>0 and b.child_count>0 and value=any(b.child_age_bands)),
  reasons as (
    select 1 category,value,jsonb_build_object('code','interest','value',value) reason from interests
    union all select 2,value,jsonb_build_object('code','child_age','value',value) from ages
    union all select 3,'',jsonb_build_object('code','travel_mode','value',a.travel_mode)
      where a.travel_mode is not null and a.travel_mode=b.travel_mode
  ) select jsonb_build_object('version',2,'context',jsonb_build_object('kind','profile'),
    'label',case when a.id=b.id then null when exists(select 1 from interests) then 'shared_interests'
      when exists(select 1 from ages) then 'similar_children' end,
    'reasons',case when a.id=b.id then '[]'::jsonb else coalesce((select jsonb_agg(reason order by category,value collate "C") from reasons),'[]') end);
$$;

create function discovery_private.trip_recommendation(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb,source_order integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare o public.trip_plans:=(ctx.trips)[source_order]; signals record; interests text[]; ages text[]; pets text[];
  common jsonb; age_reasons jsonb; plans jsonb:='[]'; reasons jsonb; label text; context jsonb; mode text;
begin
  select * into signals from discovery_private.plan_signals(t,o,f);
  select coalesce(array_agg(value order by value collate "C"),'{}') into interests from
    (select distinct value from unnest(case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end) value where value=any(t.interests)) x;
  select coalesce(array_agg(value order by value collate "C"),'{}') into ages from
    (select distinct value from unnest((ctx.crew).child_age_bands) value where (ctx.crew).child_count>0 and g.child_count>0 and value=any(g.child_age_bands)) x;
  select coalesce(jsonb_agg(jsonb_build_object('code','interest','value',value) order by value collate "C"),'[]') into common from unnest(interests) value;
  select coalesce(jsonb_agg(jsonb_build_object('code','child_age','value',value) order by value collate "C"),'[]') into age_reasons from unnest(ages) value;
  if signals.place_match>0 then plans:=plans||jsonb_build_array(jsonb_build_object('code',case when signals.place_match=2 then 'same_place' else 'same_region' end,
    'value',case when signals.place_match=2 then t.location_name else signals.place_label end)); end if;
  if signals.date_match>0 then plans:=plans||jsonb_build_array(case when signals.date_match=2 then jsonb_build_object('code','overlapping_dates')
    else jsonb_build_object('code','date_tolerance','days',(f->>'tolerance_days')::int) end); end if;
  label:=case when signals.date_match>0 and signals.place_match>0 then 'similar_plans'
    when cardinality(interests)>0 then 'shared_interests' when cardinality(ages)>0 then 'similar_children' end;
  reasons:=case when label='similar_plans' then plans||common||age_reasons else common||age_reasons||plans end;
  mode:=coalesce(o.travel_mode,(ctx.crew).travel_mode);
  if mode is not null and mode=coalesce(t.travel_mode,g.travel_mode) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','travel_mode','value',mode)); end if;
  if o.id is not null and o.landscape=t.landscape then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','landscape')); end if;
  pets:=case when o.id is not null then o.animal_kinds else (ctx.crew).animal_kinds end;
  reasons:=reasons||coalesce((select jsonb_agg(jsonb_build_object('code','animal','value',value) order by value collate "C") from unnest(pets) value where value=any(t.animal_kinds)),'[]');
  context:=case when o.id is not null then jsonb_build_object('kind','trip','tripId',o.id,'place',o.location_name,'startDate',o.start_date,'endDate',o.end_date)
    else jsonb_build_object('kind',case when f->>'start_date' is not null or f->'location'->>'id' is not null or btrim(coalesce(f->>'location_query',''))<>'' then 'search' else 'profile' end) end;
  return jsonb_build_object('recommendation',jsonb_build_object('version',2,'label',label,'reasons',reasons,'context',context));
end $$;

create function public.search_public_trips_v2(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode=force_custom_plan as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context;
  result jsonb; after_at timestamptz; after_id uuid; after_rank integer; query_key text;
begin
  if sort_mode is null or sort_mode not in('default','compatibility') or page_size is null or page_size<1 or page_size>20 then raise exception 'Invalid sorting or page size' using errcode='22023'; end if;
  ctx:=discovery_private.recommendation_context(me,f);
  query_key:=md5('recommendations:2:'||me::text||f::text||sort_mode||to_jsonb(ctx)::text);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object' or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'version' is distinct from '2' or after_cursor->>'sort' is distinct from sort_mode
        or after_cursor->>'id' is null or after_cursor->>'published_at' is null then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;after_at:=(after_cursor->>'published_at')::timestamptz;after_rank:=(after_cursor->>'rank')::integer;
      if not isfinite(after_at) or after_rank is null or after_rank<0 or after_rank>1220100 then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with requirements as materialized (
    select min(coalesce((f->>'start_date')::date,o.start_date)-coalesce((f->>'tolerance_days')::int,0)) window_start,
      max(coalesce((f->>'end_date')::date,o.end_date)+coalesce((f->>'tolerance_days')::int,0)) window_end,
      bool_or(o.id is not null) or f->'location'->>'id' is not null as place,
      bool_or(o.id is not null) as own_place,
      bit_or(discovery_private.tag_mask(case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end,'interest')) hobby_mask,
      bit_or(discovery_private.tag_mask(case when coalesce(jsonb_array_length(f->'child_age_bands'),0)>0 then array(select jsonb_array_elements_text(f->'child_age_bands'))
        when o.id is not null then o.matching_child_age_bands else (ctx.preferences).child_age_bands end,'age')) age_mask,
      bit_or(discovery_private.tag_mask(case when o.id is not null then o.animal_kinds else (ctx.crew).animal_kinds end,'animal')) animal_mask
    from unnest(ctx.trips) o
  ), eligible as materialized (
    select t.id,t.published_at from discovery_private.candidates(f,me) t
  ), preliminary as materialized (
    select e.* from eligible e where sort_mode='compatibility' or after_id is null or e.published_at<after_at or (e.published_at=after_at and e.id>after_id)
    order by e.published_at desc,e.id limit case when sort_mode='default' then page_size+1 else null end
  ), features as materialized (
    -- Query-local equivalence keys share arithmetic, never visibility decisions.
    -- Dates outside all source windows and tags no source uses do not multiply work.
    select p.*,case when r.place then t.location_kind else '' end location_kind,
      row(case when r.window_start is not null then least(r.window_end,greatest(r.window_start,t.start_date)) end,
        case when r.window_start is not null then least(r.window_end,greatest(r.window_start,t.end_date)) end,
        case when r.place then t.location_id else '' end,case when r.place then t.location_name else '' end,
        case when r.place then t.location_region else '' end,case when r.own_place then t.landscape else '' end,
        '', '',g.kind,coalesce(t.travel_mode,g.travel_mode),
        discovery_private.tag_mask(t.interests,'interest') & r.hobby_mask,
        discovery_private.tag_mask(g.child_age_bands,'age') & r.age_mask,
        discovery_private.tag_mask(t.animal_kinds,'animal') & r.animal_mask,
        coalesce((case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int*10 end),0)
          +coalesce((case when cardinality(t.matching_child_age_bands)>0 then discovery_private.overlap_ratio(t.matching_child_age_bands,(ctx.crew).child_age_bands)*10 end),0),
        (case when cardinality(t.matching_group_kinds)>0 then 10 else 0 end)+(case when cardinality(t.matching_child_age_bands)>0 then 10 else 0 end)
      )::discovery_private.score_target as key
    from preliminary p join public.trip_plans t on t.id=p.id join public.travel_groups g on g.id=t.group_id cross join requirements r
  ), representatives as materialized (
    select distinct on(key,location_kind) key,location_kind,id from features order by key,location_kind,id
  ), scores as materialized (
    select x.key,x.location_kind,m.rank,m.source_order from representatives x join public.trip_plans t on t.id=x.id
      join public.travel_groups g on g.id=t.group_id cross join lateral discovery_private.recommendation_rank(t,g,ctx,f) m
  ), ranked as not materialized (
    select e.id,e.published_at,s.rank,s.source_order from features e join scores s on s.key=e.key and s.location_kind=e.location_kind
  ), page as materialized (
    select r.* from ranked r where sort_mode='default' or after_id is null or r.rank<after_rank
      or (r.rank=after_rank and (r.published_at<after_at or (r.published_at=after_at and r.id>after_id)))
    order by case when sort_mode='compatibility' then rank end desc,published_at desc,id limit page_size+1
  ), visible as materialized (
    select p.*,discovery_private.trip_recommendation(t,g,ctx,f,p.source_order) explanation,
      row_number() over(order by case when sort_mode='compatibility' then rank end desc,p.published_at desc,p.id) position
    from (select * from page order by case when sort_mode='compatibility' then rank end desc,published_at desc,id limit page_size) p
      join public.trip_plans t on t.id=p.id join public.travel_groups g on g.id=t.group_id
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('trip',projection.trip,'crew',projection.crew)||v.explanation order by v.position)
      from visible v cross join lateral public.list_public_trips(v.id) projection),'[]'),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'score',rank%10000,'rank',rank,'version',2,'sort',sort_mode,'query_key',query_key)
      from visible order by position desc limit 1)) into result;
  return result;
end $$;

create function public.get_discovery_trip_v2(target_trip_id uuid,filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context; result jsonb;
begin
  ctx:=discovery_private.recommendation_context(me,f);
  select jsonb_build_object('trip',p.trip,'crew',p.crew)||discovery_private.trip_recommendation(t,g,ctx,f,m.source_order) into result
    from public.list_public_trips(target_trip_id) p join public.trip_plans t on t.id=target_trip_id join public.travel_groups g on g.id=t.group_id
    cross join lateral discovery_private.recommendation_rank(t,g,ctx,f) m;
  return result;
end $$;

create function public.refresh_public_trip_results_v2(trip_ids uuid[],filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context; result jsonb;
begin
  if trip_ids is null or cardinality(trip_ids)>100 then raise exception 'Invalid trip IDs' using errcode='22023'; end if;
  ctx:=discovery_private.recommendation_context(me,f);
  select coalesce(jsonb_agg(jsonb_build_object('trip',p.trip,'crew',p.crew)||discovery_private.trip_recommendation(t,g,ctx,f,m.source_order)),'[]') into result
    from discovery_private.candidates(f,me) t join public.travel_groups g on g.id=t.group_id
    cross join lateral public.list_public_trips(t.id) p cross join lateral discovery_private.recommendation_rank(t,g,ctx,f) m
    where t.id=any(trip_ids);
  return result;
end $$;

create function discovery_private.recommend_group_page(data jsonb,me uuid) returns jsonb
language sql stable set search_path='' as $$
  select data||jsonb_build_object('items',coalesce((select jsonb_agg((item-'compatibility')||jsonb_build_object(
    'recommendation',discovery_private.group_recommendation(a,b)) order by ordinal)
    from jsonb_array_elements(data->'items') with ordinality e(item,ordinal)
    join public.travel_groups b on b.id=(item->'crew'->>'id')::uuid cross join public.travel_groups a where a.id=me),'[]'));
$$;

create function public.list_ranked_public_groups_v2(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb; old_cursor jsonb; query_key text;
begin
  query_key:=md5('recommendations:2:'||me::text||filters::text||sort_mode||
    coalesce((select to_jsonb(g)::text from public.travel_groups g where g.id=me),'')||
    coalesce((select to_jsonb(p)::text from public.group_preferences p where p.group_id=me),''));
  if after_cursor is not null then
    if after_cursor->>'version' is distinct from '2' or after_cursor->>'query_key' is distinct from query_key then raise exception 'Invalid cursor' using errcode='22023'; end if;
    old_cursor:=after_cursor-'version'-'query_key';
  end if;
  result:=discovery_private.recommend_group_page(public.list_ranked_public_groups(filters,sort_mode,old_cursor,page_size),me);
  if result->'cursor'<>'null'::jsonb then result:=jsonb_set(result,'{cursor}',result->'cursor'||jsonb_build_object('version',2,'query_key',query_key)); end if;
  return result;
end $$;

create function public.refresh_public_group_results_v2(group_ids uuid[],filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  result:=discovery_private.recommend_group_page(jsonb_build_object('items',public.refresh_public_group_results(group_ids,filters)),me);
  return result->'items';
end $$;

create function public.get_public_group_v2(target_group_id uuid,after_cursor jsonb default null,page_size integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb; ctx discovery_private.match_context; f jsonb:='{}'; query_key text; old_cursor jsonb;
begin
  query_key:=md5('recommendations:2:'||me::text||target_group_id::text);
  if after_cursor is not null then
    if after_cursor->>'version' is distinct from '2' or after_cursor->>'query_key' is distinct from query_key then raise exception 'Invalid cursor' using errcode='22023'; end if;
    old_cursor:=jsonb_set(after_cursor-'version','{query_key}',to_jsonb(md5(me::text||':'||target_group_id::text)));
  end if;
  result:=public.get_public_group(target_group_id,old_cursor,page_size);
  if result is null then return null; end if;
  ctx:=discovery_private.recommendation_context(me,f);
  result:=(result-'compatibility')||jsonb_build_object('recommendation',(select discovery_private.group_recommendation(a,b) from public.travel_groups a cross join public.travel_groups b where a.id=me and b.id=target_group_id),
    'trips',coalesce((select jsonb_agg(item||discovery_private.trip_recommendation(t,g,ctx,f,m.source_order) order by ordinal)
      from jsonb_array_elements(result->'trips') with ordinality e(item,ordinal)
      join public.trip_plans t on t.id=(item->'trip'->>'id')::uuid join public.travel_groups g on g.id=t.group_id
      cross join lateral discovery_private.recommendation_rank(t,g,ctx,f) m),'[]'));
  if result->'cursor'<>'null'::jsonb then result:=jsonb_set(result,'{cursor}',result->'cursor'||jsonb_build_object('version',2,'query_key',query_key)); end if;
  return result;
end $$;

revoke all on function discovery_private.recommendation_context(uuid,jsonb),discovery_private.plan_signals(public.trip_plans,public.trip_plans,jsonb),
  discovery_private.recommendation_rank(public.trip_plans,public.travel_groups,discovery_private.match_context,jsonb),
  discovery_private.group_recommendation(public.travel_groups,public.travel_groups),
  discovery_private.trip_recommendation(public.trip_plans,public.travel_groups,discovery_private.match_context,jsonb,integer),
  discovery_private.recommend_group_page(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.search_public_trips_v2(jsonb,text,jsonb,integer),public.get_discovery_trip_v2(uuid,jsonb),
  public.refresh_public_trip_results_v2(uuid[],jsonb),public.list_ranked_public_groups_v2(jsonb,text,jsonb,integer),
  public.refresh_public_group_results_v2(uuid[],jsonb),public.get_public_group_v2(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.search_public_trips_v2(jsonb,text,jsonb,integer),public.get_discovery_trip_v2(uuid,jsonb),
  public.refresh_public_trip_results_v2(uuid[],jsonb),public.list_ranked_public_groups_v2(jsonb,text,jsonb,integer),
  public.refresh_public_group_results_v2(uuid[],jsonb),public.get_public_group_v2(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
