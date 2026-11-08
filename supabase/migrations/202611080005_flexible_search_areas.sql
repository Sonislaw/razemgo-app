-- Flexible publications describe an area; precise destinations belong to plans.
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
  elsif not unchanged_destination and new.location_id~'^(google|manual):' then
    raise exception 'Place metadata required' using errcode='22023';
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
