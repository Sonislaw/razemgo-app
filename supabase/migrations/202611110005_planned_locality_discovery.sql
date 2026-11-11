-- Share the saved locality in public trip projections. Locality filters use
-- its durable Geoapify snapshot, independent of expiring Google POI geometry.
create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  with me as materialized(select messaging_private.my_group_id() as id)
  select result.trip,result.crew from (
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'place_data',t.place_data,'search_area_data',t.search_area_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
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
    'place_data',t.place_data,'search_area_data',t.search_area_data,'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is null
  ) result order by result.published_at desc,result.id;
$$;

create or replace function places_private.location_matches(t public.trip_plans,l jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare p jsonb:=l->'place'; lat float8; lng float8; tlat float8; tlng float8; radius float8; area jsonb;
begin
  if t.mode='planned' and t.search_area_data is not null and p->>'scope'='area' and p->>'kind'='locality' then
    if t.search_area_data->>'id'=p->>'id' then return true;end if;
    if messaging_private.search_text(t.search_area_data->>'name')=messaging_private.search_text(p->>'name')
      and discovery_private.region_text(t.search_area_data->>'region')=discovery_private.region_text(p->>'region')
      and messaging_private.search_text(t.search_area_data->>'country')=messaging_private.search_text(p->>'country') then return true;end if;
  end if;
  if t.location_id=l->>'id' then return true;end if;
  if p->>'source' in('manual','geoapify') then lat:=(p->>'latitude')::float8;lng:=(p->>'longitude')::float8;area:=p->'bounds';
  else select g.latitude,g.longitude,g.bounds into lat,lng,area from places_private.geometry g where g.place_id=p->>'googlePlaceId' and g.expires_at>now();end if;
  if lat is not null then
    if t.mode='planned' and t.search_area_data is not null and p->>'scope'='area' and p->>'kind'='locality' then
      tlat:=(t.search_area_data->>'latitude')::float8;tlng:=(t.search_area_data->>'longitude')::float8;
    else
      select g.latitude,g.longitude into tlat,tlng from places_private.trip_geometry(t) g;
    end if;
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

notify pgrst,'reload schema';
