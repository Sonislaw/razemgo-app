-- Dev rollout: bounded, server-filtered discovery. Legacy detail/list RPCs stay
-- available for older clients; no existing account or trip is rewritten.
create schema discovery_private;
revoke all on schema discovery_private from public,anon,authenticated;

create function discovery_private.validate_filters(f jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare key text; allowed text[]; values_array text[]; d1 date; d2 date;
begin
  if jsonb_typeof(f) is distinct from 'object' then raise exception 'Invalid filters' using errcode='22023'; end if;
  foreach key in array array['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds'] loop
    if f ? key then
      if jsonb_typeof(f->key) is distinct from 'array' then raise exception 'Invalid filters' using errcode='22023'; end if;
      allowed:=case key when 'trip_modes' then array['planned','flexible'] when 'landscapes' then array['coast','lake','mountain','forest']
        when 'group_kinds' then array['family','couple','solo','friends'] when 'child_age_bands' then array['0–3','4–6','7–9','10–12','13–17']
        else array['dog','cat'] end;
      values_array:=array(select jsonb_array_elements_text(f->key));
      if not values_array <@ allowed or array_position(values_array,null) is not null
        or cardinality(values_array)<>(select count(distinct v) from unnest(values_array) v)
        or (key='trip_modes' and cardinality(values_array)=0) then raise exception 'Invalid filters' using errcode='22023'; end if;
    end if;
  end loop;
  if f ? 'favorites_only' and jsonb_typeof(f->'favorites_only') is distinct from 'boolean' then raise exception 'Invalid filters' using errcode='22023'; end if;
  if f ? 'location_query' and (jsonb_typeof(f->'location_query') is distinct from 'string' or char_length(f->>'location_query')>200)
    then raise exception 'Invalid location' using errcode='22023'; end if;
  if f ? 'location' and f->'location'<>'null'::jsonb then
    if jsonb_typeof(f->'location') is distinct from 'object' or f->'location'->>'kind' is null
      or f->'location'->>'kind' not in('country','region','city','village','locality')
      then raise exception 'Invalid location' using errcode='22023'; end if;
    foreach key in array array['id','name','region','country'] loop
      if jsonb_typeof(f->'location'->key) is distinct from 'string' or char_length(f->'location'->>key)>160
        then raise exception 'Invalid location' using errcode='22023'; end if;
    end loop;
  end if;
  if (f->>'start_date' is null)<>(f->>'end_date' is null) then raise exception 'Incomplete dates' using errcode='22023'; end if;
  if f->>'start_date' is not null then
    if f->>'start_date' !~ '^\d{4}-\d{2}-\d{2}$' or f->>'end_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid dates' using errcode='22023'; end if;
    begin d1:=(f->>'start_date')::date; d2:=(f->>'end_date')::date;
    exception when others then raise exception 'Invalid dates' using errcode='22023'; end;
    if d2<=d1 then raise exception 'Invalid dates' using errcode='22023'; end if;
  end if;
  if f ? 'tolerance_days' and (jsonb_typeof(f->'tolerance_days') is distinct from 'number'
    or f->>'tolerance_days' !~ '^[0-7]$') then raise exception 'Invalid tolerance' using errcode='22023'; end if;
  if f->>'source_trip_id' is not null and f->>'source_trip_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    then raise exception 'Invalid source' using errcode='22023'; end if;
  return f;
end $$;

create function discovery_private.region_text(value text) returns text language sql immutable set search_path='' as $$
  select case messaging_private.search_text(btrim(value)) when 'pomorze' then 'pomorskie' when 'dolny slask' then 'dolnoslaskie'
    else messaging_private.search_text(btrim(value)) end;
$$;
create function discovery_private.candidates(f jsonb,me uuid) returns setof public.trip_plans
language sql stable set search_path='' as $$
  select t.* from public.trip_plans t join public.travel_groups g on g.id=t.group_id
  where t.group_id<>me and t.status='published' and t.visibility='public' and t.end_date>current_date
    and not messaging_private.pair_blocked(me,g.id)
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
    and (not (f ? 'trip_modes') or t.mode in(select jsonb_array_elements_text(f->'trip_modes')))
    and (coalesce(jsonb_array_length(f->'landscapes'),0)=0 or t.landscape in(select jsonb_array_elements_text(f->'landscapes')))
    and (coalesce(jsonb_array_length(f->'group_kinds'),0)=0 or g.kind in(select jsonb_array_elements_text(f->'group_kinds')))
    and (coalesce(jsonb_array_length(f->'child_age_bands'),0)=0 or g.child_age_bands && array(select jsonb_array_elements_text(f->'child_age_bands')))
    and (coalesce(jsonb_array_length(f->'animal_kinds'),0)=0 or t.animal_kinds && array(select jsonb_array_elements_text(f->'animal_kinds')))
    and (not coalesce((f->>'favorites_only')::boolean,false) or exists(select 1 from favorites_private.trip_favorites x where x.owner_group_id=me and x.target_trip_id=t.id))
    and (f->>'start_date' is null or (t.start_date<(f->>'end_date')::date+coalesce((f->>'tolerance_days')::int,0)
      and t.end_date>(f->>'start_date')::date-coalesce((f->>'tolerance_days')::int,0)))
    and case when f->'location'->>'id' is not null then
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

create type discovery_private.match_context as (crew public.travel_groups,preferences public.group_preferences,trips public.trip_plans[]);
create function discovery_private.matching_context(me uuid,f jsonb) returns discovery_private.match_context
language plpgsql stable set search_path='' as $$
declare result discovery_private.match_context; selected public.trip_plans;
begin
  select g into result.crew from public.travel_groups g where g.id=me;
  select p into result.preferences from public.group_preferences p where p.group_id=me;
  select t.* into selected from public.trip_plans t where t.id=(f->>'source_trip_id')::uuid and t.group_id=me
    and t.status='published' and t.visibility='public' and t.end_date>current_date;
  if selected.id is not null then result.trips:=array[selected];
  else select array_agg(t order by t.created_at desc,t.id) into result.trips from public.trip_plans t
    where t.group_id=me and t.status='published' and t.visibility='public' and t.end_date>current_date; end if;
  if result.trips is null then result.trips:=array[null::public.trip_plans]; end if;
  return result;
end $$;

create function discovery_private.overlap_ratio(wanted text[],actual text[]) returns numeric
language sql immutable set search_path='' as $$
  select case when cardinality(wanted)>0 then (select count(*)::numeric/cardinality(wanted) from unnest(wanted) v where v=any(actual)) else 1 end;
$$;
create function discovery_private.score_pair(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,own_plan public.trip_plans,f jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare d1 date; d2 date; tolerance integer:=0; common integer:=0; delta integer; wanted text[]; hobbies text[]; ages text[]; kinds text[];
  same_place boolean; same_region boolean; terms jsonb:='[]'; result jsonb;
begin
  d1:=coalesce((f->>'start_date')::date,own_plan.start_date);d2:=coalesce((f->>'end_date')::date,own_plan.end_date);
  if d1 is not null and d2>d1 then
    if f->>'start_date' is not null then tolerance:=coalesce((f->>'tolerance_days')::int,0); end if;
    for delta in -tolerance..tolerance loop common:=greatest(common,least(t.end_date,d2+delta)-greatest(t.start_date,d1+delta)); end loop;
    terms:=terms||jsonb_build_array(jsonb_build_object('value',least(1,common::numeric/(d2-d1)),'weight',30,'reason','Pasujące terminy'));
  end if;
  if own_plan.id is not null then
    same_place:=case when own_plan.location_id<>'' and t.location_id<>'' then own_plan.location_id=t.location_id else
      own_plan.location_name<>'' and t.location_name<>'' and messaging_private.search_text(own_plan.location_name)=messaging_private.search_text(t.location_name)
      and messaging_private.search_text(own_plan.location_region)=messaging_private.search_text(t.location_region) end;
    same_region:=own_plan.location_region<>'' and t.location_region<>'' and messaging_private.search_text(own_plan.location_region)=messaging_private.search_text(t.location_region);
    terms:=terms||jsonb_build_array(jsonb_build_object('value',case when same_place then 1 when same_region then 0.7 else 0 end,'weight',20,'reason',case when same_place then 'Wspólny kierunek' else 'Podobny region' end),
      jsonb_build_object('value',(own_plan.landscape=t.landscape)::int,'weight',10,'reason','Podobny klimat wyjazdu'));
  end if;
  hobbies:=case when cardinality(own_plan.interests)>0 then own_plan.interests else (ctx.crew).interests end;
  ages:=array(select jsonb_array_elements_text(coalesce(f->'child_age_bands','[]')));
  if cardinality(ages)=0 then ages:=case when own_plan.id is not null then own_plan.matching_child_age_bands else (ctx.preferences).child_age_bands end; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(f->'group_kinds','[]')));
  if cardinality(kinds)=0 then kinds:=case when own_plan.id is not null then own_plan.matching_group_kinds else (ctx.preferences).group_kinds end; end if;
  if cardinality(hobbies)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(hobbies,t.interests),'weight',20,'reason','Wspólne zainteresowania')); end if;
  if cardinality(ages)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(ages,g.child_age_bands),'weight',15,'reason','Pasujący wiek dzieci')); end if;
  if cardinality(kinds)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',(g.kind=any(kinds))::int,'weight',10,'reason','Preferowany rodzaj ekipy')); end if;
  if cardinality(t.matching_group_kinds)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',((ctx.crew).kind=any(t.matching_group_kinds))::int,'weight',10,'reason','Wasze ekipy pasują do swoich preferencji')); end if;
  if cardinality(t.matching_child_age_bands)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(t.matching_child_age_bands,(ctx.crew).child_age_bands),'weight',10,'reason','Twoja ekipa pasuje wiekiem dzieci')); end if;
  wanted:=array[coalesce(own_plan.travel_mode,(ctx.crew).travel_mode)];
  terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(wanted,array[coalesce(t.travel_mode,g.travel_mode)]),'weight',5,'reason','Podobny sposób podróżowania'));
  wanted:=case when own_plan.id is not null then own_plan.animal_kinds else (ctx.crew).animal_kinds end;
  if cardinality(wanted)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(wanted,t.animal_kinds),'weight',5,'reason','Podróż ze zwierzętami')); end if;
  select jsonb_build_object('score',coalesce(round(sum(x.value*x.weight)*100/nullif(sum(x.weight),0)),0),
    'reasons',coalesce(jsonb_agg(x.reason order by term.ordinality) filter(where x.value>0),'[]')) into result
    from jsonb_array_elements(terms) with ordinality term(item,ordinality)
    cross join lateral jsonb_to_record(term.item) x(value numeric,weight integer,reason text);
  return result;
end $$;
create function discovery_private.score(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare own_plan public.trip_plans; best jsonb; current_match jsonb;
begin
  foreach own_plan in array ctx.trips loop
    current_match:=discovery_private.score_pair(t,g,ctx,own_plan,f);
    if best is null or (current_match->>'score')::int>(best->>'score')::int then best:=current_match; end if;
  end loop;
  return best;
end $$;

create function public.search_public_trips(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 20)
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
  with eligible as materialized(select t from discovery_private.candidates(f,me) t),
  -- Default ordering limits before scoring; compatibility ranks the entire
  -- filtered set before applying a cursor or page limit.
  preliminary as materialized(
    select e.t from eligible e where sort_mode='compatibility' or after_id is null or (e.t).published_at<after_at or ((e.t).published_at=after_at and (e.t).id>after_id)
    order by (e.t).published_at desc,(e.t).id limit case when sort_mode='default' then page_size+1 else null end
  ), scored as materialized(
    select p.t,g,discovery_private.score(p.t,g,ctx,f) as compatibility from preliminary p join public.travel_groups g on g.id=(p.t).group_id
  ), page as materialized(
    select s.* from scored s where sort_mode='default' or after_id is null
      or (s.compatibility->>'score')::int<after_score
      or ((s.compatibility->>'score')::int=after_score and ((s.t).published_at<after_at or ((s.t).published_at=after_at and (s.t).id>after_id)))
    order by case when sort_mode='compatibility' then (s.compatibility->>'score')::int end desc,(s.t).published_at desc,(s.t).id limit page_size+1
  ), visible as materialized(
    select p.*,row_number() over(order by case when sort_mode='compatibility' then (p.compatibility->>'score')::int end desc,(p.t).published_at desc,(p.t).id) as position
    from page p order by case when sort_mode='compatibility' then (p.compatibility->>'score')::int end desc,(p.t).published_at desc,(p.t).id limit page_size
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('trip',projection.trip,'crew',projection.crew,'compatibility',v.compatibility) order by v.position)
      from visible v cross join lateral public.list_public_trips((v.t).id) projection),'[]'),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('id',(v.t).id,'published_at',(v.t).published_at,'score',(v.compatibility->>'score')::int,'sort',sort_mode,'query_key',query_key) from visible v order by v.position desc limit 1)) into result;
  return result;
end $$;
create function public.count_public_trips(filters jsonb default '{}'::jsonb) returns integer
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters);
begin return (select count(*)::int from discovery_private.candidates(f,me)); end $$;
create function public.get_discovery_trip(target_trip_id uuid,filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context; result jsonb;
begin
  ctx:=discovery_private.matching_context(me,f);
  select jsonb_build_object('trip',p.trip,'crew',p.crew,'compatibility',discovery_private.score(t,g,ctx,f)) into result
    from public.list_public_trips(target_trip_id) p join public.trip_plans t on t.id=target_trip_id join public.travel_groups g on g.id=t.group_id;
  return result;
end $$;

create index trip_discovery_recent on public.trip_plans(published_at desc,id) where status='published' and visibility='public';
create index trip_discovery_end on public.trip_plans(end_date) where status='published' and visibility='public';
create index trip_discovery_place on public.trip_plans(location_id) where status='published' and visibility='public';
revoke all on all functions in schema discovery_private from public,anon,authenticated;
revoke all on function public.search_public_trips(jsonb,text,jsonb,integer),public.count_public_trips(jsonb),public.get_discovery_trip(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.search_public_trips(jsonb,text,jsonb,integer),public.count_public_trips(jsonb),public.get_discovery_trip(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
