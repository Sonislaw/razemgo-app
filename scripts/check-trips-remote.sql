-- Transactional smoke test for a linked Supabase project. No accounts or trips persist.
begin;
set local statement_timeout = '20s';
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  perform set_config('razemgo.test_a', a::text, true);
  perform set_config('razemgo.test_b', b::text, true);
  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (a, 'authenticated', 'authenticated', a::text || '@backend-check.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (b, 'authenticated', 'authenticated', b::text || '@backend-check.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('razemgo.test_a'), true);
do $$
declare
  profile jsonb;
  saved jsonb;
begin
  profile := public.save_my_profile('{
    "name":"Kontrola A","avatar_id":"camp-bear","kind":"family","adult_count":2,"child_count":1,
    "child_age_bands":["4–6"],"travel_mode":"Kamper","interests":["Rowery"],"animal_kinds":[],
    "matching":{"group_kinds":["family"],"child_age_bands":["4–6"],"description":"Tylko prywatne preferencje"}
  }'::jsonb);
  perform set_config('razemgo.test_group_a', profile->'group'->>'id', true);
  saved := public.save_my_trip('{
    "mode":"planned","visibility":"public","start_date":"2099-05-21","end_date":"2099-05-24",
    "location_id":"pl-locality:backend-check","location_name":"Chłapowo","location_region":"Pomorskie",
    "location_kind":"village","campground_name":"Kontrola transakcyjna","campground_address":"",
    "travel_mode":"Kamper","description":"Spokojny wyjazd nad morze, rowery i ognisko.",
    "landscape":"coast","interests":["Rowery"],"animal_kinds":["dog"],
    "matching_group_kinds":["family"],"matching_child_age_bands":["4–6"]
  }'::jsonb);
  perform set_config('razemgo.test_trip_a', saved->>'id', true);
  saved := public.save_my_trip('{"mode":"flexible","visibility":"private","landscape":"lake"}'::jsonb, null, true);
  perform set_config('razemgo.test_draft_a', saved->>'id', true);
  if (select count(*) from public.trip_plans) <> 2 then raise exception 'Owner read failed'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('razemgo.test_b'), true);
do $$
declare projected record;
begin
  perform public.save_my_profile('{
    "name":"Kontrola B","avatar_id":"trail-fox","kind":"family","adult_count":2,"child_count":0,
    "child_age_bands":[],"travel_mode":"Namiot","interests":[],"animal_kinds":[],
    "matching":{"group_kinds":[],"child_age_bands":[],"description":""}
  }'::jsonb);
  if exists(select 1 from public.trip_plans) then raise exception 'Foreign rows exposed'; end if;
  if exists(select 1 from public.travel_groups where id = current_setting('razemgo.test_group_a')::uuid) then raise exception 'Private profile exposed'; end if;
  if exists(select 1 from public.group_preferences where group_id = current_setting('razemgo.test_group_a')::uuid) then raise exception 'Private preferences exposed'; end if;
  select * into projected from public.list_public_trips(current_setting('razemgo.test_trip_a')::uuid);
  if not found then raise exception 'Public listing unavailable'; end if;
  if projected.crew ? 'owner_user_id' or projected.crew ? 'email' or projected.crew ? 'matching' then
    raise exception 'Projection leaked private data';
  end if;
  if exists(select 1 from public.list_public_trips(current_setting('razemgo.test_draft_a')::uuid)) then
    raise exception 'Draft exposed';
  end if;
  begin
    perform public.delete_my_trip(current_setting('razemgo.test_trip_a')::uuid);
    raise exception 'Foreign delete succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.change_my_trip_status(current_setting('razemgo.test_trip_a')::uuid, 'paused');
    raise exception 'Foreign status update succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.duplicate_my_trip(current_setting('razemgo.test_trip_a')::uuid);
    raise exception 'Foreign duplicate succeeded';
  exception when no_data_found then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('razemgo.test_a'), true);
select public.change_my_trip_status(current_setting('razemgo.test_trip_a')::uuid, 'paused')->>'status' as paused_status;
select set_config('request.jwt.claim.sub', current_setting('razemgo.test_b'), true);
do $$
begin
  if exists(select 1 from public.list_public_trips(current_setting('razemgo.test_trip_a')::uuid)) then
    raise exception 'Paused trip exposed';
  end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform * from public.trip_plans;
    raise exception 'Anonymous read succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.list_public_trips(null);
    raise exception 'Anonymous discovery succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
delete from auth.users where id = current_setting('razemgo.test_a')::uuid;
do $$
begin
  if exists(select 1 from public.trip_plans where group_id = current_setting('razemgo.test_group_a')::uuid) then
    raise exception 'Account deletion did not cascade';
  end if;
end;
$$;
rollback;
select true as remote_trip_backend_verified, true as fixtures_rolled_back;
