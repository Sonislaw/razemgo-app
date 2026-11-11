-- Planned trips narrow the first picker to a town or village. Flexible trips
-- keep the full administrative area catalog. Existing destinations can still
-- be paused or archived without rewriting their saved location.
create or replace function places_private.normalize_trip_place() returns trigger
language plpgsql security definer set search_path='' as $$
declare unchanged_destination boolean:=false; legacy_area boolean:=false;
begin
  if tg_op='UPDATE' then
    unchanged_destination:=new.mode=old.mode and new.location_id=old.location_id and new.place_data is not distinct from old.place_data;
    legacy_area:=unchanged_destination and new.search_area_data is not distinct from old.search_area_data and old.status<>'draft';
    if new.location_id is distinct from old.location_id and new.place_data is not distinct from old.place_data then new.place_data:=null;end if;
  end if;
  new.place_data:=places_private.normalize_place(new.place_data);
  if new.mode='flexible' then new.search_area_data:=null;
  else
    new.search_area_data:=places_private.normalize_place(new.search_area_data);
    if new.search_area_data is not null and (new.search_area_data->>'scope' is distinct from 'area' or new.search_area_data->>'source' not in('geoapify','manual'))
      then raise exception 'Select a search area' using errcode='23514';end if;
    if new.search_area_data is not null and new.search_area_data->>'kind' is distinct from 'locality' and not legacy_area
      then raise exception 'Select a town or village' using errcode='23514';end if;
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
