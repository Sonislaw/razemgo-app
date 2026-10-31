-- Dev: the participants of a journey are independent from its owner's profile.
-- Existing records remain unknown; never infer old participants from today's profile.
alter table public.trip_plans
  add column adult_count integer,
  add column child_count integer,
  add column child_age_bands text[] not null default '{}',
  add constraint trip_participants_valid check (
    (adult_count is null and child_count is null and child_age_bands='{}') or
    (adult_count is not null and child_count is not null and adult_count between 1 and 20 and child_count between 0 and 20
      and public.profile_array_valid(child_age_bands,array['0–3','4–6','7–9','10–12','13–17'],least(5,child_count))
      and (status='draft' or child_count=0 or cardinality(child_age_bands)>0))
  );


create or replace function public.guard_trip_write() returns trigger
language plpgsql set search_path = '' as $$
declare previous_status text;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.group_id <> old.group_id or new.created_at <> old.created_at
      or new.create_key is distinct from old.create_key then
      raise exception 'Trip identity cannot be changed' using errcode = '42501';
    end if;
    previous_status := case when old.status in ('published','paused') and old.end_date <= current_date
      then 'completed' else old.status end;
    if previous_status in ('completed','cancelled') and new.status <> previous_status
      or previous_status <> 'draft' and new.status = 'draft'
      or previous_status = 'draft' and new.status in ('completed','cancelled') then
      raise exception 'Invalid trip status transition' using errcode = '22023';
    end if;
    new.published_at := coalesce(old.published_at, case when new.status = 'published' then now() end);
  else
    if new.status in ('completed','cancelled') then
      raise exception 'Invalid initial trip status' using errcode = '22023';
    end if;
    new.created_at := now();
    new.published_at := case when new.status = 'published' then now() end;
  end if;
  if new.status in ('published','paused') and new.end_date <= current_date then
    raise exception 'Trip must end in the future' using errcode = '22023';
  end if;
  if new.status<>'draft' and (new.adult_count is null or new.child_count is null) then
    if tg_op='INSERT' then
      raise exception 'Trip participants required' using errcode='23514';
    elsif old.adult_count is not null or (new.status='published' and old.status<>'published') then
      raise exception 'Trip participants required' using errcode='23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.save_my_trip(trip_data jsonb, trip_id uuid default null, as_draft boolean default false, request_key uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  own_group uuid;
  previous public.trip_plans;
  saved public.trip_plans;
  next_status text;
begin
  select id into own_group from public.travel_groups where owner_user_id = (select auth.uid());
  if own_group is null then raise exception 'Profile required' using errcode = '42501'; end if;
  if jsonb_typeof(trip_data) is distinct from 'object' or as_draft is null then
    raise exception 'Invalid trip' using errcode = '22023';
  end if;
  if not as_draft and (trip_data->>'adult_count' is null or trip_data->>'child_count' is null) then
    raise exception 'Trip participants required' using errcode='23514';
  end if;
  if trip_id is not null then
    select * into previous from public.trip_plans t where t.id = trip_id for update;
    if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  end if;
  if previous.id is null then
    -- Retrying a creation after a lost response must return the same plan.
    insert into public.trip_plans(group_id, create_key, mode, status, visibility, landscape)
      values (own_group, request_key, trip_data->>'mode', 'draft', trip_data->>'visibility', trip_data->>'landscape')
      on conflict (group_id, create_key) do nothing
      returning * into previous;
    if previous.id is null then
      select * into previous from public.trip_plans t
        where t.group_id = own_group and t.create_key = request_key for update;
    end if;
  end if;
  next_status := case
    when previous.id is null or previous.status = 'draft' then case when as_draft then 'draft' else 'published' end
    when previous.status in ('published','paused') and previous.end_date <= current_date then 'completed'
    else previous.status end;
  if as_draft and previous.id is not null and previous.status <> 'draft' then
    raise exception 'Published trip cannot become a draft' using errcode = '22023';
  end if;
  if next_status = 'published' and trip_data->>'visibility' = 'private' then next_status := 'paused'; end if;
  update public.trip_plans set
    adult_count = (trip_data->>'adult_count')::integer, child_count = (trip_data->>'child_count')::integer,
    child_age_bands = array(select jsonb_array_elements_text(coalesce(trip_data->'child_age_bands','[]'::jsonb))),
    mode = trip_data->>'mode', status = next_status, visibility = trip_data->>'visibility',
    start_date = nullif(trip_data->>'start_date','')::date,
    end_date = nullif(trip_data->>'end_date','')::date,
    location_id = coalesce(trip_data->>'location_id',''),
    location_name = btrim(coalesce(trip_data->>'location_name','')),
    location_region = btrim(coalesce(trip_data->>'location_region','')),
    location_kind = nullif(trip_data->>'location_kind',''),
    campground_name = case when trip_data->>'mode' = 'planned' then btrim(coalesce(trip_data->>'campground_name','')) else '' end,
    campground_address = case when trip_data->>'mode' = 'planned' then btrim(coalesce(trip_data->>'campground_address','')) else '' end,
    travel_mode = nullif(trip_data->>'travel_mode',''),
    description = btrim(coalesce(trip_data->>'description','')),
    landscape = trip_data->>'landscape',
    interests = array(select jsonb_array_elements_text(coalesce(trip_data->'interests','[]'::jsonb))),
    animal_kinds = array(select jsonb_array_elements_text(coalesce(trip_data->'animal_kinds','[]'::jsonb))),
    matching_group_kinds = array(select jsonb_array_elements_text(coalesce(trip_data->'matching_group_kinds','[]'::jsonb))),
    matching_child_age_bands = array(select jsonb_array_elements_text(coalesce(trip_data->'matching_child_age_bands','[]'::jsonb)))
  where id = previous.id returning * into saved;
  return to_jsonb(saved);
end;
$$;

create or replace function public.duplicate_my_trip(trip_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.trip_plans;
begin
  insert into public.trip_plans (
    group_id, mode, status, visibility, start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, child_count, child_age_bands
  ) select group_id, mode, 'draft', 'private', start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, child_count, child_age_bands
    from public.trip_plans t where t.id = trip_id returning * into saved;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  with me as materialized(select messaging_private.my_group_id() as id)
  select result.trip,result.crew from (
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,'adult_count',g.adult_count,'child_count',g.child_count,
      'child_age_bands',g.child_age_bands,'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is not null and t.id=requested_trip_id
    union all
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,'adult_count',g.adult_count,'child_count',g.child_count,
      'child_age_bands',g.child_age_bands,'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is null
  ) result order by result.published_at desc,result.id;
$$;

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
        and (coalesce(jsonb_array_length(f->'child_age_bands'),0)=0 or t.child_count>0 and t.child_age_bands && array(select jsonb_array_elements_text(f->'child_age_bands')))))
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

create or replace function discovery_private.score_pair(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,own_plan public.trip_plans,f jsonb)
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
  if cardinality(ages)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(ages,t.child_age_bands),'weight',15,'reason','Pasujący wiek dzieci')); end if;
  if cardinality(kinds)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',(g.kind=any(kinds))::int,'weight',10,'reason','Preferowany rodzaj ekipy')); end if;
  if cardinality(t.matching_group_kinds)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',((ctx.crew).kind=any(t.matching_group_kinds))::int,'weight',10,'reason','Wasze ekipy pasują do swoich preferencji')); end if;
  if cardinality(t.matching_child_age_bands)>0 then terms:=terms||jsonb_build_array(jsonb_build_object('value',discovery_private.overlap_ratio(t.matching_child_age_bands,case when own_plan.id is not null then own_plan.child_age_bands else (ctx.crew).child_age_bands end),'weight',10,'reason','Twoja ekipa pasuje wiekiem dzieci')); end if;
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
      case when o.id is not null then o.child_age_bands else (ctx.crew).child_age_bands end as own_child_age_bands,
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
      discovery_private.tag_mask(own_child_age_bands,'age') as own_age_mask,
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
      bit_or(hobby_mask) as hobby_mask,bit_or(age_mask) as age_mask,bit_or(animal_mask) as animal_mask,
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
      case when r.hobby then discovery_private.tag_mask(t.interests,'interest') & r.hobby_mask else 0 end as hobby_mask,
      case when r.age then discovery_private.tag_mask(t.child_age_bands,'age') & r.age_mask else 0 end as age_mask,
      case when r.animal then discovery_private.tag_mask(t.animal_kinds,'animal') & r.animal_mask else 0 end as animal_mask,
      coalesce((case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int*100 end),0)
        +discovery_private.tag_mask(t.matching_child_age_bands,'age') as other_points,
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
      +floor((e.features).other_points/100)*10
      +case when ((e.features).other_points::int%100)>0 then
        bit_count((s.own_age_mask & ((e.features).other_points::int%100))::bit(32))::numeric
          /bit_count(((e.features).other_points::int%100)::bit(32))*10 else 0 end)/nullif(s.weight+(e.features).other_weight,0)),0)::integer) from sources s) as score
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

create or replace function discovery_private.trip_recommendation(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb,source_order integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare o public.trip_plans:=(ctx.trips)[source_order]; signals record; interests text[]; ages text[]; pets text[];
  common jsonb; age_reasons jsonb; plans jsonb:='[]'; reasons jsonb; label text; context jsonb; mode text;
begin
  select * into signals from discovery_private.plan_signals(t,o,f);
  select coalesce(array_agg(value order by value collate "C"),'{}') into interests from
    (select distinct value from unnest(case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end) value where value=any(t.interests)) x;
  select coalesce(array_agg(value order by value collate "C"),'{}') into ages from
    (select distinct value from unnest(case when o.id is not null then o.child_age_bands else (ctx.crew).child_age_bands end) value
      where (case when o.id is not null then o.child_count else (ctx.crew).child_count end)>0
        and t.child_count>0 and value=any(t.child_age_bands)) x;
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

create or replace function public.search_public_trips_v2(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode=force_custom_plan as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context;
  result jsonb; after_at timestamptz; after_id uuid; after_rank integer; query_key text;
begin
  if sort_mode is null or sort_mode not in('default','compatibility') or page_size is null or page_size<1 or page_size>20 then raise exception 'Invalid sorting or page size' using errcode='22023'; end if;
  ctx:=discovery_private.recommendation_context(me,f);
  query_key:=md5('recommendations:2:participants:'||me::text||f::text||sort_mode||to_jsonb(ctx)::text);
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
        discovery_private.tag_mask(t.child_age_bands,'age') & r.age_mask,
        discovery_private.tag_mask(t.animal_kinds,'animal') & r.animal_mask,
        coalesce((case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int*100 end),0)
          +discovery_private.tag_mask(t.matching_child_age_bands,'age'),
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

create or replace function notifications_private.proposal_matches(o public.trip_plans,p public.trip_plans) returns boolean
language sql stable security definer set search_path='' as $$
  select o.group_id<>p.group_id and o.status='published' and o.visibility='public' and o.end_date>current_date
    and p.status='published' and p.visibility='public' and p.end_date>current_date
    and greatest(o.start_date,p.start_date)<least(o.end_date,p.end_date)
    and favorites_private.can_view_trip(o.group_id,p.id) and favorites_private.can_view_trip(p.group_id,o.id)
    and exists(select 1 from public.travel_groups g where g.id=p.group_id
      and (cardinality(o.matching_group_kinds)=0 or g.kind=any(o.matching_group_kinds))
      and (cardinality(o.matching_child_age_bands)=0 or p.child_count>0 and p.child_age_bands && o.matching_child_age_bands))
    and case
      when o.location_kind='country' and o.location_id='country:PL' then p.location_id like 'pl-%' or p.location_id='country:PL'
        or discovery_private.region_text(p.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie',
          'mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
      when o.location_kind='country' then o.location_id=p.location_id
      when coalesce(o.location_region,'')<>'' then discovery_private.region_text(o.location_region)=discovery_private.region_text(p.location_region)
      when o.location_kind='region' then discovery_private.region_text(o.location_name)=discovery_private.region_text(p.location_region) or o.location_id=p.location_id
      else o.location_id=p.location_id or messaging_private.search_text(o.location_name)=messaging_private.search_text(p.location_name) end;
$$;

create or replace function messaging_private.trip_snapshot(t public.trip_plans) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,'id', t.id, 'group_id', t.group_id, 'mode', t.mode,
    'description', t.description, 'start_date', t.start_date, 'end_date', t.end_date,
    'location_name', t.location_name, 'location_region', t.location_region,
    'campground_name', t.campground_name, 'landscape', t.landscape);
$$;

create or replace function discovery_private.score_rows(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb)
returns table(score integer,reasons text[],pair_order bigint) language sql stable as $$
  with parameters as (
    select o.id as own_id,o.ordinality as pair_order,o.location_id as own_location_id,o.location_name as own_location_name,
      o.location_region as own_location_region,o.landscape as own_landscape,
      coalesce((f->>'start_date')::date,o.start_date) as d1,coalesce((f->>'end_date')::date,o.end_date) as d2,
      case when f->>'start_date' is not null then coalesce((f->>'tolerance_days')::int,0) else 0 end as tolerance,
      case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end as hobbies,
      case when coalesce(jsonb_array_length(f->'child_age_bands'),0)>0 then array(select jsonb_array_elements_text(f->'child_age_bands'))
        when o.id is not null then o.matching_child_age_bands else (ctx.preferences).child_age_bands end as ages,
      case when coalesce(jsonb_array_length(f->'group_kinds'),0)>0 then array(select jsonb_array_elements_text(f->'group_kinds'))
        when o.id is not null then o.matching_group_kinds else (ctx.preferences).group_kinds end as kinds,
      case when o.id is not null then o.child_age_bands else (ctx.crew).child_age_bands end as own_child_age_bands,
      coalesce(o.travel_mode,(ctx.crew).travel_mode) as travel_mode,
      case when o.id is not null then o.animal_kinds else (ctx.crew).animal_kinds end as animals
    from unnest(ctx.trips) with ordinality o
  ), ratios as (
    select p.*,
      case when d1 is not null and d2>d1 then greatest(0,least(t.end_date-t.start_date,d2-d1,t.end_date-(d1-tolerance),(d2+tolerance)-t.start_date))::numeric/(d2-d1) end as dates,
      case when own_id is not null then case when own_location_id<>'' and t.location_id<>'' then own_location_id=t.location_id else
        own_location_name<>'' and t.location_name<>'' and messaging_private.search_text(own_location_name)=messaging_private.search_text(t.location_name)
        and messaging_private.search_text(own_location_region)=messaging_private.search_text(t.location_region) end else false end as same_place,
      case when cardinality(hobbies)>0 then (select count(*)::numeric/cardinality(hobbies) from unnest(hobbies) x where x=any(t.interests)) end as hobby,
      case when cardinality(ages)>0 then (select count(*)::numeric/cardinality(ages) from unnest(ages) x where x=any(t.child_age_bands)) end as age,
      case when cardinality(kinds)>0 then (g.kind=any(kinds))::int end as kind,
      case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int end as other_kind,
      case when cardinality(t.matching_child_age_bands)>0 then (select count(*)::numeric/cardinality(t.matching_child_age_bands) from unnest(t.matching_child_age_bands) x where x=any(p.own_child_age_bands)) end as other_age,
      (coalesce(t.travel_mode,g.travel_mode)=travel_mode)::int as travel,
      case when cardinality(animals)>0 then (select count(*)::numeric/cardinality(animals) from unnest(animals) x where x=any(t.animal_kinds)) end as animal
    from parameters p
  ), terms as (
    select r.*,
      case when own_id is not null then case when same_place then 1
        when own_location_region<>'' and t.location_region<>'' and messaging_private.search_text(own_location_region)=messaging_private.search_text(t.location_region) then 0.7 else 0 end end as place,
      case when own_id is not null then (own_landscape=t.landscape)::int end as landscape
    from ratios r
  ) select coalesce(round(100*(coalesce(dates*30,0)+coalesce(place*20,0)+coalesce(landscape*10,0)+coalesce(hobby*20,0)+coalesce(age*15,0)+coalesce(kind*10,0)
      +coalesce(other_kind*10,0)+coalesce(other_age*10,0)+coalesce(travel*5,0)+coalesce(animal*5,0)) /
      nullif((case when dates is not null then 30 else 0 end)+(case when own_id is not null then 30 else 0 end)
        +(case when cardinality(hobbies)>0 then 20 else 0 end)+(case when cardinality(ages)>0 then 15 else 0 end)+(case when cardinality(kinds)>0 then 10 else 0 end)
        +(case when cardinality(t.matching_group_kinds)>0 then 10 else 0 end)+(case when cardinality(t.matching_child_age_bands)>0 then 10 else 0 end)+5
        +(case when cardinality(animals)>0 then 5 else 0 end),0)),0)::integer,
      array_remove(array[
        case when dates>0 then 'Pasujące terminy' end,
        case when place>0 then case when same_place then 'Wspólny kierunek' else 'Podobny region' end end,
        case when landscape>0 then 'Podobny klimat wyjazdu' end,
        case when hobby>0 then 'Wspólne zainteresowania' end,
        case when age>0 then 'Pasujący wiek dzieci' end,
        case when kind>0 then 'Preferowany rodzaj ekipy' end,
        case when other_kind>0 then 'Wasze ekipy pasują do swoich preferencji' end,
        case when other_age>0 then 'Twoja ekipa pasuje wiekiem dzieci' end,
        case when travel>0 then 'Podobny sposób podróżowania' end,
        case when animal>0 then 'Podróż ze zwierzętami' end],null),pair_order
    from terms;
$$;

notify pgrst,'reload schema';
