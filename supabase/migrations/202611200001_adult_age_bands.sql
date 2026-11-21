-- Optional age bands for the crew and the independent trip composition.
alter table public.travel_groups add column adult_age_bands text[] not null default '{}',
  add constraint travel_groups_adult_age_bands_valid check (
    public.profile_array_valid(adult_age_bands,array['18–25','26–49','50+'],least(3,adult_count))
  );

alter table public.trip_plans add column adult_age_bands text[] not null default '{}',
  add constraint trip_plans_adult_age_bands_valid check (
    public.profile_array_valid(adult_age_bands,array['18–25','26–49','50+'],least(3,coalesce(adult_count,0)))
  );

-- The profile RPC keeps column-level grants so crew numbers stay server-owned.
grant insert(adult_age_bands), update(adult_age_bands) on public.travel_groups to authenticated;

-- When older clients omit the field, keep the bands compatible with the new headcount.
create or replace function public.save_my_profile(profile_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_group public.travel_groups;
  saved_preferences public.group_preferences;
  saved_about text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(profile_data) is distinct from 'object'
    or (profile_data ? 'about' and jsonb_typeof(profile_data->'about') is distinct from 'string') then
    raise exception 'Invalid profile' using errcode = '22023';
  end if;
  insert into public.travel_groups (owner_user_id, name, avatar_id, kind, adult_count, adult_age_bands, child_count, child_age_bands, travel_mode, interests, animal_kinds)
  values (
    owner_id, btrim(profile_data->>'name'), profile_data->>'avatar_id', profile_data->>'kind',
    (profile_data->>'adult_count')::integer,
    array(select jsonb_array_elements_text(profile_data->'adult_age_bands')),
    (profile_data->>'child_count')::integer,
    array(select jsonb_array_elements_text(coalesce(profile_data->'child_age_bands', '[]'::jsonb))),
    profile_data->>'travel_mode',
    array(select jsonb_array_elements_text(coalesce(profile_data->'interests', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(profile_data->'animal_kinds', '[]'::jsonb)))
  ) on conflict (owner_user_id) do update set
    name = excluded.name, avatar_id = excluded.avatar_id, kind = excluded.kind,
    adult_count = excluded.adult_count, child_count = excluded.child_count,
    adult_age_bands = case when profile_data ? 'adult_age_bands' then excluded.adult_age_bands
      else public.travel_groups.adult_age_bands[1:excluded.adult_count] end,
    child_age_bands = excluded.child_age_bands, travel_mode = excluded.travel_mode,
    interests = excluded.interests, animal_kinds = excluded.animal_kinds, updated_at = now()
  returning * into saved_group;
  insert into public.group_preferences (group_id, group_kinds, child_age_bands, description)
  values (
    saved_group.id,
    array(select jsonb_array_elements_text(coalesce(profile_data->'matching'->'group_kinds', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(profile_data->'matching'->'child_age_bands', '[]'::jsonb))),
    btrim(coalesce(profile_data->'matching'->>'description', ''))
  ) on conflict (group_id) do update set
    group_kinds = excluded.group_kinds, child_age_bands = excluded.child_age_bands, description = excluded.description
  returning * into saved_preferences;
  if profile_data ? 'about' then
    perform public.save_my_group_visibility(null,profile_data->>'about');
  end if;
  select p.about into saved_about from public.group_public_profiles p where p.group_id=saved_group.id;
  return jsonb_build_object('group',to_jsonb(saved_group),'preferences',to_jsonb(saved_preferences),
    'about',coalesce(saved_about,''));
end $$;

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
    adult_age_bands = case when trip_data ? 'adult_age_bands'
      then array(select jsonb_array_elements_text(trip_data->'adult_age_bands'))
      else previous.adult_age_bands[1:coalesce((trip_data->>'adult_count')::integer,0)] end,
    child_age_bands = array(select jsonb_array_elements_text(coalesce(trip_data->'child_age_bands','[]'::jsonb))),
    mode = trip_data->>'mode', status = next_status, visibility = trip_data->>'visibility',
    start_date = nullif(trip_data->>'start_date','')::date,
    end_date = nullif(trip_data->>'end_date','')::date,
    search_area_data = case when trip_data ? 'search_area_data' then trip_data->'search_area_data' else previous.search_area_data end,
    place_data = trip_data->'place_data',
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
    search_area_data, place_data, group_id, mode, status, visibility, start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, adult_age_bands, child_count, child_age_bands
  ) select search_area_data, place_data, group_id, mode, 'draft', 'private', start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, adult_age_bands, child_count, child_age_bands
    from public.trip_plans t where t.id = trip_id returning * into saved;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  return to_jsonb(saved);
end;
$$;

create or replace function messaging_private.public_crew(g public.travel_groups) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,
    'adult_count',g.adult_count,'adult_age_bands',g.adult_age_bands,'child_count',g.child_count,'child_age_bands',g.child_age_bands,
    'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds,'passport',passport_private.summary(g.id));
$$;

create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  with me as materialized(select messaging_private.my_group_id() as id)
  select result.trip,result.crew from (
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'place_data',t.place_data,'search_area_data',t.search_area_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'adult_age_bands',t.adult_age_bands,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is not null and t.id=requested_trip_id
    union all
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'place_data',t.place_data,'search_area_data',t.search_area_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'adult_age_bands',t.adult_age_bands,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is null
  ) result order by result.published_at desc,result.id;
$$;

create or replace function messaging_private.trip_snapshot(t public.trip_plans) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('adult_count',t.adult_count,'adult_age_bands',t.adult_age_bands,'child_count',t.child_count,'child_age_bands',t.child_age_bands,'id', t.id, 'group_id', t.group_id, 'mode', t.mode,
    'description', t.description, 'start_date', t.start_date, 'end_date', t.end_date,
    'location_name', t.location_name, 'location_region', t.location_region,
    'campground_name', t.campground_name, 'landscape', t.landscape)||case when t.place_data is null then '{}'::jsonb else jsonb_build_object('place_data',t.place_data,'location_id',t.location_id) end;
$$;

notify pgrst,'reload schema';
