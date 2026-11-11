-- Keep the selected search area independently of the precise destination.
alter table public.trip_plans add column search_area_data jsonb;
create table geoapify_private.places (
  area_id text not null references geoapify_private.areas(id),
  id text not null,
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<10000),
  updated_at timestamptz not null default now(),
  primary key(area_id,id)
);
alter table geoapify_private.places enable row level security;
revoke all on geoapify_private.places from public,anon,authenticated;
create function public.get_geoapify_area(area_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select data from geoapify_private.areas where id=substr(area_id,10);
$$;
revoke all on function public.get_geoapify_area(text) from public,anon,authenticated;
grant execute on function public.get_geoapify_area(text) to service_role;

create function geoapify_private.record_places(cache_key text,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p jsonb; field text; area text;
begin
  if cache_key~'^geoapify:places:v1:[a-f0-9]{64}$' then
    area:=payload->>'areaId';
    if area is null or area!~'^geoapify:[A-Za-z0-9_-]{5,240}$' or not exists(select 1 from geoapify_private.areas where id=substr(area,10))
      or jsonb_typeof(payload->'places') is distinct from 'array' or jsonb_array_length(payload->'places')>8
      then raise exception 'Invalid place results' using errcode='22023';end if;
    for p in select jsonb_array_elements(payload->'places') loop
      if p->>'source' is distinct from 'geoapify' or p->>'scope' is distinct from 'place' or p->>'areaId' is distinct from area
        or p->>'geoapifyPlaceId' is null or p->>'geoapifyPlaceId'!~'^[A-Za-z0-9_-]{5,240}$'
        or p->>'id' is distinct from 'geoapify:'||(p->>'geoapifyPlaceId') or p->>'kind' is null or p->>'kind' not in('campground','place') or p->>'googlePlaceId' is not null
        then raise exception 'Invalid place result' using errcode='22023';end if;
      foreach field in array array['name','address','region','country'] loop
        if jsonb_typeof(p->field) is distinct from 'string' or char_length(p->>field)>(case field when 'name' then 160 when 'address' then 300 else 100 end)
          then raise exception 'Invalid place text' using errcode='22023';end if;
      end loop;
      if btrim(p->>'name')='' or btrim(p->>'country')='' or jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'longitude') is distinct from 'number'
        or abs((p->>'latitude')::float8)>85 or abs((p->>'longitude')::float8)>180
        then raise exception 'Invalid place coordinates' using errcode='22023';end if;
      insert into geoapify_private.places(area_id,id,data) values(substr(area,10),p->>'geoapifyPlaceId',p)
        on conflict(area_id,id) do update set data=excluded.data,updated_at=now();
    end loop;
  elsif cache_key~'^geoapify:address:v1:[a-f0-9]{64}$' then
    p:=payload->'geometry';
    if jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'longitude') is distinct from 'number'
      or abs((p->>'latitude')::float8)>85 or abs((p->>'longitude')::float8)>180 then raise exception 'Invalid geometry' using errcode='22023';end if;
  else raise exception 'Invalid place cache key' using errcode='22023';end if;
  insert into geoapify_private.search_cache(key,payload) values(cache_key,payload)
    on conflict(key) do update set payload=excluded.payload,expires_at=now()+interval '24 hours';
end $$;
revoke all on function geoapify_private.record_places(text,jsonb) from public,anon,authenticated;

create or replace function public.claim_api_cache_refresh(cache_key text, refresh_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare acquired uuid; held api_cache_private.refresh_leases;
begin
  if cache_key is null or cache_key !~ '^(places:geometry:|weather:forecast:|weather:alerts:|geoapify:autocomplete:|geoapify:places:|geoapify:address:).+'
    or char_length(cache_key)>400 or refresh_id is null then raise exception 'Invalid refresh' using errcode='22023'; end if;
  insert into api_cache_private.refresh_leases as l(key,request_id,expires_at)
  values(cache_key,refresh_id,clock_timestamp()+interval '60 seconds')
  on conflict(key) do update set request_id=excluded.request_id,expires_at=excluded.expires_at,retry_after='-infinity'
    where l.expires_at<=clock_timestamp() and l.retry_after<=clock_timestamp()
  returning request_id into acquired;
  if acquired is not null then return jsonb_build_object('state','acquired'); end if;
  select * into held from api_cache_private.refresh_leases where key=cache_key;
  return jsonb_build_object('state',case when held.retry_after>clock_timestamp() then 'cooldown' else 'busy' end);
end $$;

create or replace function public.commit_api_cache_refresh(cache_key text, refresh_id uuid, payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare held api_cache_private.refresh_leases; identifier text; kind text;
begin
  select * into held from api_cache_private.refresh_leases where key=cache_key and request_id=refresh_id
    and expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid cache payload' using errcode='22023'; end if;
  if starts_with(cache_key,'geoapify:places:') or starts_with(cache_key,'geoapify:address:') then
    perform geoapify_private.record_places(cache_key,payload);
  elsif starts_with(cache_key,'geoapify:autocomplete:') then
    perform geoapify_private.record_search(cache_key,payload);
  elsif starts_with(cache_key,'places:geometry:') then
    identifier:=substr(cache_key,17);
    if char_length(identifier) not between 5 and 256 or identifier !~ '^[A-Za-z0-9_-]+$' or payload->>'placeId' is distinct from identifier then
      raise exception 'Invalid geometry key' using errcode='22023'; end if;
    perform public.record_google_place_geometry(identifier,(payload->>'latitude')::float8,(payload->>'longitude')::float8,nullif(payload->'bounds','null'::jsonb));
  else
    kind:=case when starts_with(cache_key,'weather:forecast:') then 'forecast' when starts_with(cache_key,'weather:alerts:') then 'alerts' end;
    if kind is null or jsonb_typeof(payload->case kind when 'forecast' then 'days' else 'alerts' end) is distinct from 'array'
      then raise exception 'Invalid weather payload' using errcode='22023'; end if;
    identifier:=substr(cache_key,length('weather:'||kind||':')+1);
    insert into weather_private.components(key,component,payload,expires_at)
    values(identifier,kind,payload,clock_timestamp()+case kind when 'forecast' then interval '60 minutes' else interval '10 minutes' end)
    on conflict(key,component) do update set payload=excluded.payload,expires_at=excluded.expires_at;
  end if;
  delete from api_cache_private.refresh_leases where key=cache_key and request_id=refresh_id;
  return true;
end $$;

create or replace function places_private.normalize_place(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text; source text; identifier text; label text; google_id text; canonical jsonb;
begin
  if p is null or p='null'::jsonb then return null; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Invalid place' using errcode='22023';end if;
  if p->>'source'='geoapify' and p->>'scope'='place' then
    select data into canonical from geoapify_private.places where id=p->>'geoapifyPlaceId' and area_id=substr(p->>'areaId',10);
    if canonical is null or p->>'id' is distinct from canonical->>'id' then raise exception 'Unknown place in selected area' using errcode='22023';end if;
    return canonical;
  end if;
  if p->>'source'='geoapify' then
    if p->>'geoapifyPlaceId' is null or p->>'id' is distinct from 'geoapify:'||(p->>'geoapifyPlaceId') then
      raise exception 'Invalid area identifier' using errcode='22023';end if;
    select data into canonical from geoapify_private.areas where id=p->>'geoapifyPlaceId';
    if canonical is null then raise exception 'Unknown search area' using errcode='22023';end if;
    return canonical;
  end if;
  source:=p->>'source';identifier:=p->>'id';google_id:=p->>'googlePlaceId';
  if source is null or source not in('google','manual') or p->>'kind' is null or p->>'kind' not in('locality','campground','place','region','country')
    then raise exception 'Invalid place' using errcode='22023';end if;
  foreach k in array array['id','name','address','region','country'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or char_length(p->>k)>(case k when 'id' then 263 when 'address' then 300 when 'name' then 160 else 100 end)
      then raise exception 'Invalid place' using errcode='22023';end if;
  end loop;
  if btrim(p->>'name')='' then raise exception 'Place name required' using errcode='22023';end if;
  if google_id is not null and (jsonb_typeof(p->'googlePlaceId')<>'string' or char_length(google_id) not between 5 and 256 or google_id !~ '^[A-Za-z0-9_-]+$')
    then raise exception 'Invalid Google place' using errcode='22023';end if;
  if source='google' then
    if google_id is null or identifier<>'google:'||google_id
      or jsonb_typeof(p->'userLabel') is distinct from 'string' or btrim(p->>'userLabel')='' or char_length(p->>'userLabel')>160
      then raise exception 'Invalid Google place' using errcode='22023';end if;
    label:=btrim(p->>'userLabel');
    return jsonb_build_object('id',identifier,'source','google','kind',p->>'kind','googlePlaceId',google_id,
      'name',label,'userLabel',label,'address','','region','','country','');
  end if;
  if identifier !~* '^manual:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then raise exception 'Invalid manual place' using errcode='22023';end if;
  if p ? 'scope' then
    if p->>'scope' is distinct from 'area' or p->>'kind' not in('locality','region','country')
      or p->>'address'<>'' or p->>'latitude' is not null or p->>'longitude' is not null or google_id is not null
      or (p->>'kind'<>'country' and char_length(btrim(p->>'country'))<2)
      or (p->>'kind'='locality' and char_length(btrim(p->>'region'))<2)
      or (p->>'kind' in('region','country') and char_length(btrim(p->>'name'))>100)
      then raise exception 'Invalid search area' using errcode='22023';end if;
    return jsonb_build_object('id',identifier,'source','manual','scope','area','kind',p->>'kind','name',btrim(p->>'name'),'address','',
      'region',case when p->>'kind'='region' then btrim(p->>'name') when p->>'kind'='locality' then btrim(p->>'region') else '' end,
      'country',case when p->>'kind'='country' then btrim(p->>'name') else btrim(p->>'country') end);
  end if;
  if (p->>'latitude' is null)<>(p->>'longitude' is null) or (p->>'latitude' is not null and
    (jsonb_typeof(p->'latitude')<>'number' or jsonb_typeof(p->'longitude')<>'number'
      or not ((p->>'latitude')::float8 between -85 and 85 and (p->>'longitude')::float8 between -180 and 180)))
    then raise exception 'Invalid coordinates' using errcode='22023';end if;
  if (p->>'latitude' is null or google_id is not null) and
    (char_length(btrim(p->>'address'))<2 or char_length(btrim(p->>'region'))<2 or char_length(btrim(p->>'country'))<2)
    then raise exception 'Complete address or map point required' using errcode='22023';end if;
  return jsonb_build_object('id',identifier,'source','manual','kind',p->>'kind','name',btrim(p->>'name'),
    'address',btrim(p->>'address'),'region',btrim(p->>'region'),'country',btrim(p->>'country'))||
    case when google_id is not null then jsonb_build_object('googlePlaceId',google_id)
      when p->>'latitude' is not null then jsonb_build_object('latitude',p->'latitude','longitude',p->'longitude') else '{}'::jsonb end;
end $$;

create or replace function places_private.normalize_trip_place() returns trigger
language plpgsql security definer set search_path='' as $$
declare unchanged_destination boolean:=false;
begin
  -- Existing publications remain readable and can be paused/archived. Editing
  -- or changing their destination uses the new area rules, including old APKs.
  if tg_op='UPDATE' then
    unchanged_destination:=new.mode=old.mode and new.location_id=old.location_id and new.place_data is not distinct from old.place_data;
    if new.location_id is distinct from old.location_id and new.place_data is not distinct from old.place_data then new.place_data:=null;end if;
  end if;
  new.place_data:=places_private.normalize_place(new.place_data);
  if new.mode='flexible' then new.search_area_data:=null;
  else
    new.search_area_data:=places_private.normalize_place(new.search_area_data);
    if new.search_area_data is not null and (new.search_area_data->>'scope' is distinct from 'area' or new.search_area_data->>'source' not in('geoapify','manual'))
      then raise exception 'Select a search area' using errcode='23514';end if;
    if new.place_data->>'scope'='place' and new.place_data->>'source'='geoapify' and new.place_data->>'areaId' is distinct from new.search_area_data->>'id'
      then raise exception 'Place does not belong to selected search area' using errcode='23514';end if;
    if new.status in('published','paused') and new.search_area_data is not null and new.place_data is null
      then raise exception 'Select a precise destination' using errcode='23514';end if;
  end if;
  if new.place_data is not null then
    if not unchanged_destination and new.mode='flexible' and
      (new.place_data->>'scope'='place' or new.place_data->>'kind' not in('locality','region','country') or (new.place_data->>'source'='manual' and new.place_data->>'scope' is distinct from 'area'))
      then raise exception 'Flexible trips require a locality, region or country' using errcode='22023';end if;
    if new.mode='planned' and new.place_data->>'scope'='area'
      then raise exception 'Choose a planned destination' using errcode='22023';end if;
    new.location_id:=new.place_data->>'id';new.location_name:=new.place_data->>'name';new.location_region:=new.place_data->>'region';
    new.location_kind:=case when new.place_data->>'kind' in('region','country') then new.place_data->>'kind' else 'locality' end;
    new.campground_name:='';new.campground_address:='';
  elsif not unchanged_destination and new.location_id~'^(google|manual|geoapify):' then
    raise exception 'Place metadata required' using errcode='22023';
  end if;
  return new;
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
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, child_count, child_age_bands
  ) select search_area_data, place_data, group_id, mode, 'draft', 'private', start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, child_count, child_age_bands
    from public.trip_plans t where t.id = trip_id returning * into saved;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  return to_jsonb(saved);
end;
$$;
