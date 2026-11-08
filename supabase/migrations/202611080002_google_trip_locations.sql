-- Trips and saved criteria retain provider IDs, user descriptions and manual places.
alter table public.trip_plans add column place_data jsonb;
alter table public.trip_plans drop constraint trip_plans_location_id_check;
alter table public.trip_plans add constraint trip_plans_location_id_check check (char_length(location_id)<=263);
alter table places_private.geometry add column bounds jsonb;
drop function public.record_google_place_geometry(text,float8,float8);
create function public.record_google_place_geometry(place_id text,latitude float8,longitude float8,bounds jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into places_private.geometry(place_id,latitude,longitude,bounds)
  values (place_id,latitude,longitude,case when bounds is null then null else discovery_private.map_bounds(bounds) end)
  on conflict on constraint geometry_pkey do update set latitude=excluded.latitude,longitude=excluded.longitude,bounds=excluded.bounds,
    refreshed_at=now(),expires_at=now()+interval '28 days';
end $$;
revoke all on function public.record_google_place_geometry(text,float8,float8,jsonb) from public,anon,authenticated;
grant execute on function public.record_google_place_geometry(text,float8,float8,jsonb) to service_role;

create function places_private.normalize_place(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; source text; identifier text; label text;
begin
  if p is null or p='null'::jsonb then return null; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Invalid place' using errcode='22023';end if;
  source:=p->>'source';identifier:=p->>'id';
  if source is null or source not in('google','manual') or p->>'kind' is null or p->>'kind' not in('locality','campground','place','region','country')
    then raise exception 'Invalid place' using errcode='22023';end if;
  foreach k in array array['id','name','address','region','country'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or char_length(p->>k)>(case k when 'id' then 263 when 'address' then 300 when 'name' then 160 else 100 end)
      then raise exception 'Invalid place' using errcode='22023';end if;
  end loop;
  if btrim(p->>'name')='' then raise exception 'Place name required' using errcode='22023';end if;
  if source='google' then
    if jsonb_typeof(p->'googlePlaceId') is distinct from 'string' or char_length(p->>'googlePlaceId') not between 5 and 256
      or p->>'googlePlaceId' !~ '^[A-Za-z0-9_-]+$' or identifier<>'google:'||(p->>'googlePlaceId')
      or jsonb_typeof(p->'userLabel') is distinct from 'string' or btrim(p->>'userLabel')='' or char_length(p->>'userLabel')>160
      then raise exception 'Invalid Google place' using errcode='22023';end if;
    label:=btrim(p->>'userLabel');
    return jsonb_build_object('id',identifier,'source','google','kind',p->>'kind','googlePlaceId',p->>'googlePlaceId',
      'name',label,'userLabel',label,'address','','region','','country','');
  end if;
  if identifier !~* '^manual:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then raise exception 'Invalid manual place' using errcode='22023';end if;
  if (p->>'latitude' is null)<>(p->>'longitude' is null) or (p->>'latitude' is not null and
    (jsonb_typeof(p->'latitude')<>'number' or jsonb_typeof(p->'longitude')<>'number'
      or not ((p->>'latitude')::float8 between -85 and 85 and (p->>'longitude')::float8 between -180 and 180)))
    then raise exception 'Invalid coordinates' using errcode='22023';end if;
  return jsonb_build_object('id',identifier,'source','manual','kind',p->>'kind','name',btrim(p->>'name'),
    'address',btrim(p->>'address'),'region',btrim(p->>'region'),'country',btrim(p->>'country'))||
    case when p->>'latitude' is not null then jsonb_build_object('latitude',p->'latitude','longitude',p->'longitude') else '{}'::jsonb end;
end $$;
revoke all on function places_private.normalize_place(jsonb) from public,anon,authenticated;

create function places_private.normalize_trip_place() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Older installed clients can replace a modern destination with a legacy one.
  if tg_op='UPDATE' and new.location_id is distinct from old.location_id and new.place_data is not distinct from old.place_data then new.place_data:=null;end if;
  new.place_data:=places_private.normalize_place(new.place_data);
  if new.place_data is not null then
    new.location_id:=new.place_data->>'id';new.location_name:=new.place_data->>'name';new.location_region:=new.place_data->>'region';
    new.location_kind:=case when new.place_data->>'kind' in('region','country') then new.place_data->>'kind' else 'locality' end;
    new.campground_name:='';new.campground_address:='';
  end if;
  return new;
end $$;
revoke all on function places_private.normalize_trip_place() from public,anon,authenticated;
create trigger trip_place_normalization before insert or update on public.trip_plans
  for each row execute function places_private.normalize_trip_place();

create function places_private.trip_geometry(t public.trip_plans)
returns table(latitude float8,longitude float8) language sql stable set search_path='' as $$
  select case when t.place_data->>'source'='manual' then (t.place_data->>'latitude')::float8 else coalesce(g.latitude,l.latitude) end,
    case when t.place_data->>'source'='manual' then (t.place_data->>'longitude')::float8 else coalesce(g.longitude,l.longitude) end
  from (select 1) seed left join places_private.geometry g on g.place_id=t.place_data->>'googlePlaceId' and g.expires_at>now()
  left join discovery_private.map_locations l on l.id=t.location_id;
$$;
revoke all on function places_private.trip_geometry(public.trip_plans) from public,anon,authenticated;

create function places_private.location_matches(t public.trip_plans,l jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare p jsonb:=l->'place'; lat float8; lng float8; tlat float8; tlng float8; radius float8; area jsonb;
begin
  if t.location_id=l->>'id' then return true;end if;
  if p->>'source'='manual' then lat:=(p->>'latitude')::float8;lng:=(p->>'longitude')::float8;
  else select g.latitude,g.longitude,g.bounds into lat,lng,area from places_private.geometry g where g.place_id=p->>'googlePlaceId' and g.expires_at>now();end if;
  if lat is not null then
    select g.latitude,g.longitude into tlat,tlng from places_private.trip_geometry(t) g;
    if tlat is not null and p->>'kind' in('region','country') and area is not null then
      return tlat between (area->>'south')::float8 and (area->>'north')::float8 and tlng between (area->>'west')::float8 and (area->>'east')::float8;
    end if;
    radius:=case p->>'kind' when 'country' then 700 when 'region' then 150 when 'locality' then 20 else 1 end;
    if tlat is not null then return 6371*2*asin(sqrt(least(1.0,power(sin(radians(tlat-lat)/2),2)+cos(radians(lat))*cos(radians(tlat))*power(sin(radians(tlng-lng)/2),2))))<=radius;end if;
  end if;
  return messaging_private.search_text(t.location_name)=messaging_private.search_text(l->>'name');
end $$;
revoke all on function places_private.location_matches(public.trip_plans,jsonb) from public,anon,authenticated;

create or replace function discovery_private.map_candidates(f jsonb,me uuid)
returns table(id uuid,mode text,published_at timestamptz,location_name text,latitude float8,longitude float8,radius_m float8,extent jsonb)
language sql stable set search_path='' as $$
  select t.id,t.mode,t.published_at,t.location_name,g.latitude,g.longitude,0::float8,null::jsonb
  from discovery_private.candidates(f,me) t cross join lateral places_private.trip_geometry(t) g where t.mode='planned';
$$;

create or replace function public.list_my_map_place_refreshes() returns setof text
language sql stable security definer set search_path='' as $$
  with me as (select favorites_private.my_group_id() id), available as (
    select t.place_data->>'googlePlaceId' id from me cross join lateral discovery_private.candidates('{}',me.id) t
    where t.place_data->>'source'='google' and t.mode='planned'
    union select t.place_data->>'googlePlaceId' from me join public.trip_plans t on t.group_id=me.id where t.place_data->>'source'='google'
    union select s.filters->'location'->'place'->>'googlePlaceId' from me join discovery_private.saved_filter_sets s on s.owner_group_id=me.id
      where s.kind='trips' and s.filters->'location'->'place'->>'source'='google'
  ) select a.id from available a left join places_private.geometry g on g.place_id=a.id
  where a.id is not null and (g.expires_at is null or g.expires_at<now()+interval '3 days') order by a.id limit 4;
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
    place_data, group_id, mode, status, visibility, start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands, adult_count, child_count, child_age_bands
  ) select place_data, group_id, mode, 'draft', 'private', start_date, end_date, location_id, location_name, location_region,
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
    'place_data',t.place_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is not null and t.id=requested_trip_id
    union all
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'place_data',t.place_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is null
  ) result order by result.published_at desc,result.id;
$$;

create or replace function discovery_private.validate_filters(f jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare key text; allowed text[]; values_array text[]; d1 date; d2 date; p jsonb;
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
    if f->'location' ? 'place' then
      p:=places_private.normalize_place(f->'location'->'place');
      if p is null then raise exception 'Invalid place' using errcode='22023';end if;
      f:=jsonb_set(f,'{location}',jsonb_build_object('place',p,'id',p->>'id','name',p->>'name','region',p->>'region','country',p->>'country',
        'kind',case when p->>'kind' in('country','region') then p->>'kind' else 'locality' end));
    end if;
    if jsonb_typeof(f->'location') is distinct from 'object' or f->'location'->>'kind' is null
      or f->'location'->>'kind' not in('country','region','city','village','locality')
      then raise exception 'Invalid location' using errcode='22023'; end if;
    foreach key in array array['id','name','region','country'] loop
      if jsonb_typeof(f->'location'->key) is distinct from 'string' or char_length(f->'location'->>key)>(case when key='id' then 263 else 160 end)
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
      when f->'location'->'place'->>'source' in('google','manual') then places_private.location_matches(t,f->'location')
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

create or replace function discovery_private.filter_set_payload(filter_kind text,payload jsonb,me uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare f jsonb; keys text[]; array_keys text[]; key text;
begin
  if filter_kind not in ('trips','groups') or filter_kind is null
    or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16000 then
    raise exception 'Invalid filter set' using errcode='22023';
  end if;
  if filter_kind='trips' then
    keys:=array['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds','favorites_only',
      'location_query','location','start_date','end_date','tolerance_days'];
    array_keys:=array['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds'];
    f:='{"trip_modes":["planned","flexible"],"landscapes":[],"group_kinds":[],"child_age_bands":[],"animal_kinds":[],
      "favorites_only":false,"location_query":"","location":null,"start_date":null,"end_date":null,"tolerance_days":0}'::jsonb||payload;
    f:=discovery_private.validate_filters(f);
    f:=jsonb_set(f,'{location_query}',to_jsonb(btrim(f->>'location_query')));
    if f->>'start_date' is null then f:=jsonb_set(f,'{tolerance_days}','0'); end if;
  else
    keys:=array['name','group_kinds','child_age_bands','travel_modes','interests','animal_kinds','has_trips','online_only','favorites_only'];
    array_keys:=array['group_kinds','child_age_bands','travel_modes','interests','animal_kinds'];
    f:='{"name":"","group_kinds":[],"child_age_bands":[],"travel_modes":[],"interests":[],"animal_kinds":[],
      "has_trips":false,"online_only":false,"favorites_only":false}'::jsonb||payload;
    -- Existing directory validation, with no candidate rows or result snapshots.
    perform discovery_private.directory_candidates(f,me,'{}'::uuid[]);
    f:=jsonb_set(f,'{name}',to_jsonb(btrim(f->>'name')));
  end if;
  for key in select jsonb_object_keys(f) loop
    if not key=any(keys) then raise exception 'Unknown filter' using errcode='22023'; end if;
  end loop;
  foreach key in array array_keys loop
    if jsonb_typeof(f->key) is distinct from 'array' or jsonb_array_length(f->key)>20
      or exists(select 1 from jsonb_array_elements(f->key) v where jsonb_typeof(v)<>'string')
      or jsonb_array_length(f->key)<>(select count(distinct v) from jsonb_array_elements(f->key) v) then
      raise exception 'Invalid filter values' using errcode='22023';
    end if;
    f:=jsonb_set(f,array[key],coalesce((select jsonb_agg(v order by v) from jsonb_array_elements(f->key) v),'[]'::jsonb));
  end loop;
  return f;
end $$;
notify pgrst,'reload schema';

create function public.list_google_place_refreshes() returns setof text
language sql stable security definer set search_path='' as $$
  with referenced as (
    select t.place_data->>'googlePlaceId' id from public.trip_plans t
      where t.place_data->>'source'='google' and t.status in('published','paused') and t.end_date>current_date
    union select s.filters->'location'->'place'->>'googlePlaceId' from discovery_private.saved_filter_sets s
      where s.kind='trips' and s.filters->'location'->'place'->>'source'='google'
  ) select r.id from referenced r left join places_private.geometry g on g.place_id=r.id
  where r.id is not null and (g.expires_at is null or g.expires_at<now()+interval '3 days') order by r.id limit 20;
$$;
revoke all on function public.list_google_place_refreshes() from public,anon,authenticated;
grant execute on function public.list_google_place_refreshes() to service_role;
notify pgrst,'reload schema';
