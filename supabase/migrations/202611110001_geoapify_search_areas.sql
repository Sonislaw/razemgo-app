-- Provider names and coordinates for flexible trips are stored permanently.
-- Only the authenticated server can populate the Geoapify catalogue.
create schema geoapify_private;
revoke all on schema geoapify_private from public,anon,authenticated;
create table geoapify_private.areas (
  id text primary key check(char_length(id) between 5 and 240 and id~'^[A-Za-z0-9_-]+$'),
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<10000),
  updated_at timestamptz not null default now()
);
create table geoapify_private.search_cache (
  key text primary key, payload jsonb not null check(octet_length(payload::text)<100000),
  expires_at timestamptz not null default now()+interval '24 hours'
);
create table geoapify_private.provider_budget (id boolean primary key default true check(id),stamp timestamptz not null,used integer not null);
alter table geoapify_private.areas enable row level security;
alter table geoapify_private.search_cache enable row level security;
alter table geoapify_private.provider_budget enable row level security;
revoke all on all tables in schema geoapify_private from public,anon,authenticated;
create function public.get_geoapify_search_cache(cache_key text) returns jsonb
language sql stable security definer set search_path='' as $$
  select payload from geoapify_private.search_cache where key=cache_key and expires_at>now();
$$;
create function public.claim_geoapify_provider_request() returns boolean
language plpgsql security definer set search_path='' as $$
declare acquired integer; stamp_now timestamptz:=date_trunc('second',clock_timestamp());
begin
  insert into geoapify_private.provider_budget as b(id,stamp,used) values(true,stamp_now,1)
    on conflict(id) do update set stamp=stamp_now,used=case when b.stamp=stamp_now then b.used+1 else 1 end
      where b.stamp<>stamp_now or b.used<4 returning used into acquired;
  return acquired is not null;
end $$;
revoke all on function public.get_geoapify_search_cache(text),public.claim_geoapify_provider_request() from public,anon,authenticated;
grant execute on function public.get_geoapify_search_cache(text),public.claim_geoapify_provider_request() to service_role;
create function geoapify_private.record_search(cache_key text,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p jsonb; k text; b jsonb;
begin
  if cache_key!~'^geoapify:autocomplete:pl:v1:[a-f0-9]{64}$' or jsonb_typeof(payload->'areas') is distinct from 'array'
    or jsonb_array_length(payload->'areas')>8 then raise exception 'Invalid areas' using errcode='22023';end if;
  for p in select jsonb_array_elements(payload->'areas') loop
    if p->>'source' is distinct from 'geoapify' or p->>'scope' is distinct from 'area' or p->>'kind' is null or p->>'kind' not in('locality','region','country')
      or p->>'address' is distinct from '' or p->>'googlePlaceId' is not null
      or p->>'geoapifyPlaceId' is null or char_length(p->>'geoapifyPlaceId') not between 5 and 240 or p->>'geoapifyPlaceId'!~'^[A-Za-z0-9_-]+$'
      or p->>'id' is distinct from 'geoapify:'||(p->>'geoapifyPlaceId')
      or jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'longitude') is distinct from 'number'
      or not((p->>'latitude')::float8 between -85 and 85 and (p->>'longitude')::float8 between -180 and 180)
      then raise exception 'Invalid area' using errcode='22023';end if;
    foreach k in array array['name','region','country'] loop
      if jsonb_typeof(p->k) is distinct from 'string' or char_length(p->>k)>(case k when 'name' then 160 else 100 end)
        or (k<>'region' and btrim(p->>k)='') then raise exception 'Invalid area label' using errcode='22023';end if;
    end loop;
    b:=p->'bounds';
    if b is not null and (jsonb_typeof(b)<>'object' or
      jsonb_typeof(b->'south') is distinct from 'number' or jsonb_typeof(b->'north') is distinct from 'number' or
      jsonb_typeof(b->'west') is distinct from 'number' or jsonb_typeof(b->'east') is distinct from 'number' or
      not((b->>'south')::float8 between -85 and 85 and (b->>'north')::float8 between -85 and 85 and
        (b->>'west')::float8 between -180 and 180 and (b->>'east')::float8 between -180 and 180 and
        (b->>'south')::float8<=(b->>'north')::float8 and (b->>'west')::float8<=(b->>'east')::float8))
      then raise exception 'Invalid area bounds' using errcode='22023';end if;
    insert into geoapify_private.areas(id,data) values(p->>'geoapifyPlaceId',p)
      on conflict(id) do update set data=excluded.data,updated_at=now();
  end loop;
  insert into geoapify_private.search_cache(key,payload) values(cache_key,payload)
    on conflict(key) do update set payload=excluded.payload,expires_at=now()+interval '24 hours';
end $$;
revoke all on function geoapify_private.record_search(text,jsonb) from public,anon,authenticated;

-- Shared cross-isolate cache ownership and fenced writes also cover Geoapify.
create or replace function public.claim_api_cache_refresh(cache_key text, refresh_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare acquired uuid; held api_cache_private.refresh_leases;
begin
  if cache_key is null or cache_key !~ '^(places:geometry:|weather:forecast:|weather:alerts:|geoapify:autocomplete:).+'
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
  if starts_with(cache_key,'geoapify:autocomplete:') then
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

-- The server catalogue is authoritative; client labels/coordinates cannot override it.
create or replace function places_private.normalize_place(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text; source text; identifier text; label text; google_id text; canonical jsonb;
begin
  if p is null or p='null'::jsonb then return null; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Invalid place' using errcode='22023';end if;
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
  if new.place_data is not null then
    if not unchanged_destination and new.mode='flexible' and
      (new.place_data->>'kind' not in('locality','region','country') or (new.place_data->>'source'='manual' and new.place_data->>'scope' is distinct from 'area'))
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
create or replace function places_private.trip_geometry(t public.trip_plans)
returns table(latitude float8,longitude float8) language sql stable set search_path='' as $$
  select case when t.place_data->>'source' in('manual','geoapify') and t.place_data->>'googlePlaceId' is null then (t.place_data->>'latitude')::float8 else coalesce(g.latitude,l.latitude) end,
    case when t.place_data->>'source' in('manual','geoapify') and t.place_data->>'googlePlaceId' is null then (t.place_data->>'longitude')::float8 else coalesce(g.longitude,l.longitude) end
  from (select 1) seed left join places_private.geometry g on g.place_id=t.place_data->>'googlePlaceId' and g.expires_at>now()
  left join discovery_private.map_locations l on l.id=t.location_id;
$$;
create or replace function places_private.location_matches(t public.trip_plans,l jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare p jsonb:=l->'place'; lat float8; lng float8; tlat float8; tlng float8; radius float8; area jsonb;
begin
  if t.location_id=l->>'id' then return true;end if;
  if p->>'source' in('manual','geoapify') then lat:=(p->>'latitude')::float8;lng:=(p->>'longitude')::float8;area:=p->'bounds';
  else select g.latitude,g.longitude,g.bounds into lat,lng,area from places_private.geometry g where g.place_id=p->>'googlePlaceId' and g.expires_at>now();end if;
  if lat is not null then
    select g.latitude,g.longitude into tlat,tlng from places_private.trip_geometry(t) g;
    if tlat is not null and p->>'kind' in('region','country') and area is not null then
      return tlat between (area->>'south')::float8 and (area->>'north')::float8 and tlng between (area->>'west')::float8 and (area->>'east')::float8;
    end if;
    radius:=case p->>'kind' when 'country' then 700 when 'region' then 150 when 'locality' then 20 else 1 end;
    if tlat is not null then return 6371*2*asin(sqrt(least(1.0,power(sin(radians(tlat-lat)/2),2)+cos(radians(lat))*cos(radians(tlat))*power(sin(radians(tlng-lng)/2),2))))<=radius;end if;
  end if;
  if p->>'kind'='region' and discovery_private.region_text(t.location_region)=discovery_private.region_text(l->>'name') then return true;end if;
  if p->>'kind'='country' and (messaging_private.search_text(t.place_data->>'country')=messaging_private.search_text(l->>'name')
    or (messaging_private.search_text(l->>'name') in('polska','poland','pl') and (t.location_id like 'pl-%' or t.location_id='country:PL'))) then return true;end if;
  return messaging_private.search_text(t.location_name)=messaging_private.search_text(l->>'name');
end $$;
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
      when f->'location'->'place'->>'source' in('google','manual','geoapify') then places_private.location_matches(t,f->'location')
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

alter function discovery_private.validate_filters(jsonb) stable;
create or replace function weather_private.expire_cache() returns void
language plpgsql security definer set search_path='' as $$ begin
  delete from weather_private.cache where expires_at<=now();
  delete from weather_private.components where expires_at<=now();
  delete from geoapify_private.search_cache where expires_at<=now();
  delete from api_cache_private.refresh_leases where expires_at<now()-interval '5 minutes' and retry_after<=now();
end $$;
notify pgrst,'reload schema';
