-- Manual destinations retain user-written labels and addresses. Google-derived
-- geometry is referenced by place ID and shares the existing expiring cache.
create or replace function places_private.normalize_place(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; source text; identifier text; label text; google_id text;
begin
  if p is null or p='null'::jsonb then return null; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Invalid place' using errcode='22023';end if;
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

create or replace function places_private.trip_geometry(t public.trip_plans)
returns table(latitude float8,longitude float8) language sql stable set search_path='' as $$
  select case when t.place_data->>'source'='manual' and t.place_data->>'googlePlaceId' is null then (t.place_data->>'latitude')::float8 else coalesce(g.latitude,l.latitude) end,
    case when t.place_data->>'source'='manual' and t.place_data->>'googlePlaceId' is null then (t.place_data->>'longitude')::float8 else coalesce(g.longitude,l.longitude) end
  from (select 1) seed left join places_private.geometry g on g.place_id=t.place_data->>'googlePlaceId' and g.expires_at>now()
  left join discovery_private.map_locations l on l.id=t.location_id;
$$;

create or replace function places_private.location_matches(t public.trip_plans,l jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare p jsonb:=l->'place'; lat float8; lng float8; tlat float8; tlng float8; radius float8; area jsonb;
begin
  if t.location_id=l->>'id' then return true;end if;
  if p->>'source'='manual' and p->>'googlePlaceId' is null then lat:=(p->>'latitude')::float8;lng:=(p->>'longitude')::float8;
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

create or replace function public.list_my_map_place_refreshes() returns setof text
language sql stable security definer set search_path='' as $$
  with me as (select favorites_private.my_group_id() id), available as (
    select t.place_data->>'googlePlaceId' id from me cross join lateral discovery_private.candidates('{}',me.id) t
      where t.mode='planned'
    union select t.place_data->>'googlePlaceId' from me join public.trip_plans t on t.group_id=me.id
    union select s.filters->'location'->'place'->>'googlePlaceId' from me join discovery_private.saved_filter_sets s on s.owner_group_id=me.id
      where s.kind='trips'
  ) select a.id from available a left join places_private.geometry g on g.place_id=a.id
  where a.id is not null and (g.expires_at is null or g.expires_at<now()+interval '3 days') order by a.id limit 4;
$$;

create or replace function public.list_google_place_refreshes() returns setof text
language sql stable security definer set search_path='' as $$
  with referenced as (
    select t.place_data->>'googlePlaceId' id from public.trip_plans t
      where t.status in('published','paused') and t.end_date>current_date
    union select s.filters->'location'->'place'->>'googlePlaceId' from discovery_private.saved_filter_sets s where s.kind='trips'
  ) select r.id from referenced r left join places_private.geometry g on g.place_id=r.id
  where r.id is not null and (g.expires_at is null or g.expires_at<now()+interval '3 days') order by r.id limit 20;
$$;
notify pgrst,'reload schema';
