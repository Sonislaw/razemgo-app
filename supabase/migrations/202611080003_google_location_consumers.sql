-- Preserve passport milestones, chat context and text-only manual region searches.
create or replace function passport_private.trip_published(t public.trip_plans) returns void
language plpgsql security definer set search_path='' as $$
declare first_publication integer;
begin
  if t.published_at is null or t.visibility<>'public' or t.status='draft' then return; end if;
  insert into passport_private.trip_publications(trip_id,group_id) values(t.id,t.group_id) on conflict do nothing;
  get diagnostics first_publication=row_count;
  if first_publication>0 then
    perform passport_private.record_event(t.group_id,case when t.mode='planned' then 'plans' else 'ideas' end,t.id::text);
    if t.mode='planned' then
      perform passport_private.record_event(t.group_id,'destinations',t.location_id);
      perform passport_private.record_event(t.group_id,'landscapes',t.landscape);
    end if;
  end if;
  if t.mode='planned' and (btrim(t.campground_name)<>'' or t.place_data->>'kind'='campground') then
    perform passport_private.record_event(t.group_id,'campgrounds',t.id::text);
  end if;
end $$;

drop trigger passport_trip on public.trip_plans;
create trigger passport_trip after insert or update of status,visibility,mode,location_id,landscape,campground_name,place_data
  on public.trip_plans for each row execute function passport_private.activity_changed();

create or replace function messaging_private.trip_snapshot(t public.trip_plans) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,'id', t.id, 'group_id', t.group_id, 'mode', t.mode,
    'description', t.description, 'start_date', t.start_date, 'end_date', t.end_date,
    'location_name', t.location_name, 'location_region', t.location_region,
    'campground_name', t.campground_name, 'landscape', t.landscape)||case when t.place_data is null then '{}'::jsonb else jsonb_build_object('place_data',t.place_data,'location_id',t.location_id) end;
$$;

create or replace function places_private.location_matches(t public.trip_plans,l jsonb) returns boolean
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
  if p->>'kind'='region' and discovery_private.region_text(t.location_region)=discovery_private.region_text(l->>'name') then return true;end if;
  if p->>'kind'='country' and (messaging_private.search_text(t.place_data->>'country')=messaging_private.search_text(l->>'name')
    or (messaging_private.search_text(l->>'name') in('polska','poland','pl') and (t.location_id like 'pl-%' or t.location_id='country:PL'))) then return true;end if;
  return messaging_private.search_text(t.location_name)=messaging_private.search_text(l->>'name');
end $$;
notify pgrst,'reload schema';
