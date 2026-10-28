-- Dev first. The three invoker-only helpers are fully qualified and not
-- executable by API roles. Let them inline into callers whose search_path is
-- fixed to empty. No SECURITY DEFINER function loses its fixed search_path.
alter function discovery_private.candidates(jsonb,uuid) reset search_path;
alter function messaging_private.search_text(text) reset search_path;
alter function messaging_private.group_search_matches(public.travel_groups,text) reset search_path;

-- Exact set intersections for the closed, unique tag arrays enforced by CHECK
-- constraints. Include the legacy trip-only "Las" tag. Regression tests derive
-- the allowed tags from constraints, so extending a domain requires this map.
-- This is a pure SQL expression, inlined once per source/target, not per pair.
create function discovery_private.tag_mask(tags text[],family text) returns integer
language sql immutable as $$
  select case family
    when 'interest' then
      coalesce(('Rowery'=any(tags))::int,0)
      +coalesce(('Spokojny wypoczynek'=any(tags))::int,0)*2
      +coalesce(('Ognisko'=any(tags))::int,0)*4
      +coalesce(('Plaża'=any(tags))::int,0)*8
      +coalesce(('Przyroda'=any(tags))::int,0)*16
      +coalesce(('Wędrówki'=any(tags))::int,0)*32
      +coalesce(('Kajaki'=any(tags))::int,0)*64
      +coalesce(('Fotografia'=any(tags))::int,0)*128
      +coalesce(('Gry planszowe'=any(tags))::int,0)*256
      +coalesce(('Zwiedzanie'=any(tags))::int,0)*512
      +coalesce(('Las'=any(tags))::int,0)*1024
    when 'age' then
      coalesce(('0–3'=any(tags))::int,0)+coalesce(('4–6'=any(tags))::int,0)*2
      +coalesce(('7–9'=any(tags))::int,0)*4+coalesce(('10–12'=any(tags))::int,0)*8
      +coalesce(('13–17'=any(tags))::int,0)*16
    when 'animal' then coalesce(('dog'=any(tags))::int,0)+coalesce(('cat'=any(tags))::int,0)*2
    else 0 end;
$$;
revoke all on function discovery_private.tag_mask(text[],text) from public,anon,authenticated;

-- Query-local score key. IDs, publication times, descriptions and campsite
-- names do not affect matching. Equal keys can share exact arithmetic within
-- one request; visibility and ordering still apply to every individual trip.
create type discovery_private.score_target as (
  start_date date,end_date date,location_id text,location_name text,location_region text,landscape text,
  normalized_name text,normalized_region text,kind text,travel_mode text,
  hobby_mask integer,age_mask integer,animal_mask integer,other_points numeric,other_weight integer
);

-- Reuse forbidden ID sets once rather than scanning them for each candidate.
-- These primary-key/FK columns are NOT NULL, so NOT IN retains anti-join semantics.
create or replace function discovery_private.candidates(f jsonb,me uuid) returns setof public.trip_plans
language sql stable as $$
  select t.* from public.trip_plans t
  where t.group_id<>me and t.status='published' and t.visibility='public' and t.end_date>current_date
    and t.group_id not in(select x.blocked_group_id from public.group_blocks x where x.blocker_group_id=me
      union all select x.blocker_group_id from public.group_blocks x where x.blocked_group_id=me)
    and t.group_id not in(select g.id from public.travel_groups g join moderation_private.suspended_accounts s on s.user_id=g.owner_user_id)
    and not exists(select 1 from moderation_private.suspended_accounts s where s.user_id=(select owner_user_id from public.travel_groups where id=me))
    and t.id not in(select h.trip_id from moderation_private.hidden_trips h)
    and (not (f ? 'trip_modes') or t.mode in(select jsonb_array_elements_text(f->'trip_modes')))
    and (coalesce(jsonb_array_length(f->'landscapes'),0)=0 or t.landscape in(select jsonb_array_elements_text(f->'landscapes')))
    and ((coalesce(jsonb_array_length(f->'group_kinds'),0)=0 and coalesce(jsonb_array_length(f->'child_age_bands'),0)=0)
      or exists(select 1 from public.travel_groups g where g.id=t.group_id
        and (coalesce(jsonb_array_length(f->'group_kinds'),0)=0 or g.kind in(select jsonb_array_elements_text(f->'group_kinds')))
        and (coalesce(jsonb_array_length(f->'child_age_bands'),0)=0 or g.child_age_bands && array(select jsonb_array_elements_text(f->'child_age_bands')))))
    and (coalesce(jsonb_array_length(f->'animal_kinds'),0)=0 or t.animal_kinds && array(select jsonb_array_elements_text(f->'animal_kinds')))
    and (not coalesce((f->>'favorites_only')::boolean,false) or exists(select 1 from favorites_private.trip_favorites x where x.owner_group_id=me and x.target_trip_id=t.id))
    and (f->>'start_date' is null or (t.start_date<(f->>'end_date')::date+coalesce((f->>'tolerance_days')::int,0)
      and t.end_date>(f->>'start_date')::date-coalesce((f->>'tolerance_days')::int,0)))
    and case when f->'location'->>'id' is null and btrim(coalesce(f->>'location_query',''))='' then true
      when f->'location'->>'id' is not null then
      case f->'location'->>'kind'
        when 'country' then case
          when f->'location'->>'id'='country:PL' then t.location_id like 'pl-%' or t.location_id='country:PL'
            or t.location_id in('demo-location-chlapowo','demo-location-gdansk','demo-location-kaszuby','demo-location-polska')
            or discovery_private.region_text(t.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie','mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
          else t.location_id=f->'location'->>'id' end
        when 'region' then t.location_id=f->'location'->>'id' or discovery_private.region_text(t.location_region)=discovery_private.region_text(f->'location'->>'name')
        else t.location_id=f->'location'->>'id' end
      else strpos(messaging_private.search_text(t.location_name||', '||t.location_region||case when discovery_private.region_text(t.location_region)='pomorskie' then ' Pomorze Pomorskie' else '' end),
        messaging_private.search_text(btrim(coalesce(f->>'location_query',''))))>0 end;
$$;

create or replace function public.search_public_trips(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  ), sources as materialized(
    select s.*,discovery_private.tag_mask(hobbies,'interest') as hobby_mask,cardinality(hobbies) as hobby_count,
      discovery_private.tag_mask(ages,'age') as age_mask,cardinality(ages) as age_count,
      discovery_private.tag_mask(animals,'animal') as animal_mask,cardinality(animals) as animal_count,
      (case when d1 is not null and d2>d1 then 30 else 0 end)+(case when has_plan then 30 else 0 end)
        +(case when cardinality(hobbies)>0 then 20 else 0 end)+(case when cardinality(ages)>0 then 15 else 0 end)
        +(case when cardinality(kinds)>0 then 10 else 0 end)+(case when cardinality(animals)>0 then 5 else 0 end)+5 as weight
    from source_values s
  ), requirements as materialized(
    select bool_or(has_plan) as place,bool_or(d1 is not null and d2>d1) as dates,
      bool_or(hobby_count>0) as hobby,bool_or(age_count>0) as age,bool_or(animal_count>0) as animal,
      bool_or(cardinality(kinds)>0) as kind from sources
  ), target_values as not materialized(
    -- Omit inputs no source uses from the score key. The typed composite's
    -- equality/hash compares NULL fields consistently; no shared global cache.
    select t.id,t.published_at,
      case when r.dates then t.start_date end as start_date,case when r.dates then t.end_date end as end_date,
      case when r.place then t.location_id else '' end as location_id,
      case when r.place then t.location_name else '' end as location_name,
      case when r.place then t.location_region else '' end as location_region,
      case when r.place then t.landscape else '' end as landscape,
      case when r.place then messaging_private.search_text(t.location_name) else '' end as normalized_name,
      case when r.place then messaging_private.search_text(t.location_region) else '' end as normalized_region,
      case when r.kind then g.kind else '' end as kind,coalesce(t.travel_mode,g.travel_mode) as travel_mode,
      case when r.hobby then discovery_private.tag_mask(t.interests,'interest') else 0 end as hobby_mask,
      case when r.age then discovery_private.tag_mask(g.child_age_bands,'age') else 0 end as age_mask,
      case when r.animal then discovery_private.tag_mask(t.animal_kinds,'animal') else 0 end as animal_mask,
      coalesce((case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int*10 end),0)
        +coalesce((case when cardinality(t.matching_child_age_bands)>0 then
          bit_count((discovery_private.tag_mask(t.matching_child_age_bands,'age') & discovery_private.tag_mask((ctx.crew).child_age_bands,'age'))::bit(32))::numeric/cardinality(t.matching_child_age_bands)*10 end),0) as other_points,
      (case when cardinality(t.matching_group_kinds)>0 then 10 else 0 end)
        +(case when cardinality(t.matching_child_age_bands)>0 then 10 else 0 end) as other_weight
    from discovery_private.candidates(f,me) t join public.travel_groups g on g.id=t.group_id cross join requirements r
  ), eligible as materialized(
    select id,published_at,row(start_date,end_date,location_id,location_name,location_region,landscape,
      normalized_name,normalized_region,kind,travel_mode,hobby_mask,age_mask,animal_mask,other_points,other_weight)::discovery_private.score_target as features
    from target_values
  ), unique_targets as materialized(
    select distinct features from eligible
  ), feature_scores as materialized(
    select e.features,(select max(coalesce(round(100*(
      coalesce((case when s.d1 is not null and s.d2>s.d1 then
        greatest(0,least((e.features).end_date-(e.features).start_date,s.d2-s.d1,(e.features).end_date-(s.d1-s.tolerance),(s.d2+s.tolerance)-(e.features).start_date))::numeric/(s.d2-s.d1)*30 end),0)
      +case when s.has_plan then (case when
        case when s.location_id<>'' and (e.features).location_id<>'' then s.location_id=(e.features).location_id else
          s.location_name<>'' and (e.features).location_name<>'' and s.normalized_name=(e.features).normalized_name and s.normalized_region=(e.features).normalized_region end
        then 1 when s.location_region<>'' and (e.features).location_region<>'' and s.normalized_region=(e.features).normalized_region then 0.7 else 0 end)*20
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

-- Profiles with the same matching inputs share a result within this request.
-- Keep the business formula in group_compatibility_values, including its
-- reasons and limited-data flags. Presentation/identity fields stay outside.
create type messaging_private.group_score_target as (
  kind text,child_count integer,child_age_bands text[],interests text[],travel_mode text,
  group_kinds text[],wanted_child_age_bands text[]
);
create or replace function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; viewer_preferences public.group_preferences; result jsonb;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
  cursor_name text; cursor_id uuid; cursor_score integer;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if page_size is null or page_size<1 or page_size>20 or sort_mode is null or sort_mode not in('compatibility','alphabetical') or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'name',''))>80 then raise exception 'Invalid filters' using errcode='22023'; end if;
  if after_cursor is not null then
    if jsonb_typeof(after_cursor) is distinct from 'object' or not after_cursor ?& array['name','id','score','sort']
      or jsonb_typeof(after_cursor->'name') is distinct from 'string' or char_length(after_cursor->>'name')>40
      or after_cursor->>'sort' is distinct from sort_mode
      or coalesce(after_cursor->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(after_cursor->'score') not in('null','number') then raise exception 'Invalid cursor' using errcode='22023'; end if;
    if jsonb_typeof(after_cursor->'score')='number' and after_cursor->>'score' !~ '^(100|[1-9]?[0-9])$' then
      raise exception 'Invalid cursor score' using errcode='22023'; end if;
    cursor_name:=messaging_private.search_text(after_cursor->>'name'); cursor_id:=(after_cursor->>'id')::uuid;
    cursor_score:=case when sort_mode='compatibility' then coalesce((after_cursor->>'score')::integer,-1) else 0 end;
  end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  select * into viewer from public.travel_groups where id=me;
  select * into viewer_preferences from public.group_preferences where group_id=me;
  -- Carry only keys through the full candidate set. Full profiles, private
  -- preferences and about text are joined for the requested page. Alphabetical
  -- reads never build compatibility JSON for the other candidates.
  with eligible as materialized (
    select g.id,messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me
      and g.id not in(select x.blocked_group_id from public.group_blocks x where x.blocker_group_id=me
        union all select x.blocker_group_id from public.group_blocks x where x.blocked_group_id=me)
      and g.owner_user_id not in(select s.user_id from moderation_private.suspended_accounts s)
      and (btrim(coalesce(filters->>'name',''))='' or messaging_private.group_search_matches(g,filters->>'name'))
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
  ), targets as materialized (
    select e.*,case when sort_mode='compatibility' then row(g.kind,case when g.child_count=0 then 0 else 1 end,
      g.child_age_bands,g.interests,g.travel_mode,gp.group_kinds,gp.child_age_bands)::messaging_private.group_score_target end as features
    from eligible e join public.travel_groups g on g.id=e.id left join public.group_preferences gp on gp.group_id=e.id
  ), unique_targets as materialized (
    select features,min(id::text)::uuid as representative_id from targets where sort_mode='compatibility' group by features
  ), feature_scores as materialized (
    select features,messaging_private.group_compatibility_values(viewer,g,viewer_preferences,gp) as compatibility
    from unique_targets u join public.travel_groups g on g.id=u.representative_id
      left join public.group_preferences gp on gp.group_id=u.representative_id
  ), ranked as not materialized (
    select e.id,e.sort_name,s.compatibility from targets e left join feature_scores s on s.features=e.features
  ), ordered as (
    select r.*,case when sort_mode='compatibility' then coalesce((r.compatibility->>'score')::integer,-1) else 0 end as sort_score from ranked r
  ), matched as materialized (
    select * from ordered where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,id limit page_size+1
  ), page as materialized (
    select * from matched order by sort_score desc,sort_name,id limit page_size
  ), projected as materialized (
    select p.*,g.name,details.about,
      coalesce(p.compatibility,messaging_private.group_compatibility_values(viewer,g,viewer_preferences,gp)) as matching,
      messaging_private.public_crew(g) as crew,messaging_private.public_trip_count(g.id) as active_trip_count
    from page p join public.travel_groups g on g.id=p.id
      join public.group_public_profiles details on details.group_id=p.id
      left join public.group_preferences gp on gp.group_id=p.id
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',matching) order by sort_score desc,sort_name,id) from projected),'[]'::jsonb),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',matching->'score','sort',sort_mode)
      from projected order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

-- The optional filters have radically different selectivity. A generic plan
-- estimates too few candidates and can turn the score-key join into nested
-- rescans after repeated calls. Replan these two bounded read RPCs using their
-- actual arguments; the setting is local to function execution, not the pool.
alter function public.search_public_trips(jsonb,text,jsonb,integer) set plan_cache_mode=force_custom_plan;
alter function public.list_ranked_public_groups(jsonb,text,jsonb,integer) set plan_cache_mode=force_custom_plan;

notify pgrst,'reload schema';
