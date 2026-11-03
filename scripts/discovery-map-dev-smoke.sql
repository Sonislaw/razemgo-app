-- Dev only. Temporary users, publications, favorites and queued events roll back.
begin;
do $$
declare u uuid; s uuid; saved jsonb; payload jsonb;
begin
  for i in 1..2 loop
    u:=gen_random_uuid(); s:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u::text||'@map-test.invalid',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(s,u,now(),now());
    perform set_config('qa.map_user_'||i,u::text,true);
    perform set_config('qa.map_session_'||i,s::text,true);
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated')::text,true);
    perform public.save_my_profile(jsonb_build_object('name','Test mapy '||i,'avatar_id','trail-fox','kind','family',
      'adult_count',2,'child_count',1,'child_age_bands','["4–6"]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,
      'animal_kinds','[]'::jsonb,'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
  end loop;
  for i in 1..3 loop
    payload:=jsonb_build_object('adult_count',2,'child_count',1,'child_age_bands','["4–6"]'::jsonb,
      'mode',case when i=3 then 'flexible' else 'planned' end,'visibility','public',
      'start_date','2099-05-21','end_date','2099-05-24',
      'location_id',case when i=3 then 'country:PL' else 'pl-locality:4259' end,
      'location_name',case when i=3 then 'Polska' else 'Chłapowo' end,
      'location_kind',case when i=3 then 'country' else 'village' end,
      'location_region',case when i=3 then '' else 'pomorskie' end,
      'campground_name','','campground_address','','description','Test mapy: spokojny urlop nad morzem.',
      'travel_mode','Kamper','landscape','coast','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,
      'matching_group_kinds','[]'::jsonb,'matching_child_age_bands','[]'::jsonb);
    saved:=public.save_my_trip(payload,null,false,gen_random_uuid());
    perform set_config('qa.map_trip_'||i,saved->>'id',true);
  end loop;
end $$;
set local role authenticated;
do $$
declare result jsonb; first_page jsonb; next_page jsonb; key text;
  filters jsonb:='{"favorites_only":true}';
  bounds jsonb:='{"south":48,"north":56,"west":13,"east":25}';
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.map_user_1'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.map_user_1'),'session_id',current_setting('qa.map_session_1'),'role','authenticated')::text,true);
  for i in 1..3 loop
    perform public.set_my_trip_favorite(current_setting('qa.map_trip_'||i)::uuid,true);
  end loop;
  result:=public.search_trip_map(filters,bounds,5);
  if (result->>'planned_count')::int<>2 or (result->>'flexible_count')::int<>0 or (result->>'total_count')::int<>2 then
    raise exception 'Map totals differ';
  end if;
  if jsonb_array_length(result->'points')<>1 or result->'points'->0->>'count'<>'2' then raise exception 'Co-located cluster differs'; end if;
  if result->'areas'<>'[]'::jsonb then raise exception 'Flexible marker exposed'; end if;
  key:=result->'points'->0->>'key';
  first_page:=public.get_trip_map_items(filters,bounds,5,key,null,1);
  next_page:=public.get_trip_map_items(filters,bounds,5,key,first_page->'cursor',1);
  if first_page->>'has_more'<>'true' or next_page->>'has_more'<>'false'
    or first_page->'items'->0->'trip'->>'id'=next_page->'items'->0->'trip'->>'id' then raise exception 'Map pagination differs'; end if;
  result:=public.get_trip_map_items(filters,bounds,5,'areas',null,5);
  if result->>'total_count'<>'0' then raise exception 'Retired area selector exposed results'; end if;
  result:=public.search_trip_map(filters,'{"south":49,"north":50,"west":22,"east":23}',5);
  if result->>'planned_count'<>'0' or result->>'flexible_count'<>'0' then raise exception 'Viewport differs'; end if;
  result:=public.get_trip_map_items(filters,bounds,5,'trip:'||current_setting('qa.map_trip_3'),null,5);
  if result->>'total_count'<>'0' then raise exception 'Flexible ID exposed on map'; end if;
  result:=public.search_trip_map(filters||'{"trip_modes":["flexible"]}',bounds,5);
  if result->>'planned_count'<>'2' or result->'areas'<>'[]'::jsonb then raise exception 'Map type lock bypassed'; end if;
  result:=public.search_public_trips_v3(filters||'{"trip_modes":["flexible"]}',null,5);
  if result->>'total_count'<>'1' then raise exception 'List search lost flexible trips'; end if;
  begin
    perform 1 from discovery_private.map_locations;
    raise exception 'Private coordinates are exposed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',current_setting('qa.map_user_2'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.map_user_2'),'session_id',current_setting('qa.map_session_2'),'role','authenticated')::text,true);
  if public.search_trip_map(filters,bounds,5)->>'total_count'<>'0' then raise exception 'Account favorites leaked'; end if;
  begin
    perform public.get_trip_map_items(filters,bounds,5,key,first_page->'cursor',1);
    raise exception 'Foreign cursor accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: Dev planned-only map, type lock, list independence, pagination and account isolation; test data rolled back' as result;
