-- Run only against Dev. Temporary accounts and all writes are rolled back.
begin;
do $$
declare u uuid; s uuid;
begin
  for i in 1..2 loop
    u:=gen_random_uuid(); s:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u::text||'@saved-filters-test.invalid',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(s,u,now(),now());
    perform set_config('qa.filter_user_'||i,u::text,true);
    perform set_config('qa.filter_session_'||i,s::text,true);
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated')::text,true);
    perform public.save_my_profile(jsonb_build_object('name','Test filtrów '||i,'avatar_id','trail-fox','kind','couple',
      'adult_count',2,'child_count',0,'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,
      'animal_kinds','[]'::jsonb,'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
  end loop;
end $$;
set local role authenticated;
do $$
declare target uuid:=gen_random_uuid(); saved jsonb; renamed jsonb; rev jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.filter_user_1'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.filter_user_1'),'session_id',current_setting('qa.filter_session_1'),'role','authenticated')::text,true);
  saved:=public.save_my_filter_set(target,'trips','Test Dev','{"start_date":"2000-05-01","end_date":"2000-05-04","tolerance_days":3,"favorites_only":true}'::jsonb);
  if saved->'filters'->>'start_date'<>'2000-05-01' or saved->'filters'->>'tolerance_days'<>'3' then raise exception 'Criteria mismatch'; end if;
  rev:=public.get_my_sync_state()->'domains';
  if public.save_my_filter_set(target,'trips','Test Dev',saved->'filters')<>saved then raise exception 'Retry mismatch'; end if;
  if public.get_my_sync_state()->'domains'<>rev then raise exception 'Retry changed revisions'; end if;
  renamed:=public.save_my_filter_set(target,'trips','Po zmianie',null);
  if renamed->'filters'<>saved->'filters' then raise exception 'Rename changed criteria'; end if;
  perform public.save_my_filter_set(gen_random_uuid(),'groups','Po zmianie','{"online_only":true,"favorites_only":true,"travel_modes":["Van"]}'::jsonb);
  if jsonb_array_length(public.list_my_filter_sets())<>2 then raise exception 'Wrong set count'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('qa.filter_user_2'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.filter_user_2'),'session_id',current_setting('qa.filter_session_2'),'role','authenticated')::text,true);
  if public.list_my_filter_sets()<>'[]'::jsonb then raise exception 'Foreign records visible'; end if;
  begin
    perform public.save_my_filter_set(target,'trips','Cudzy','{}'::jsonb);
    raise exception 'Foreign update accepted';
  exception when sqlstate 'P0002' then null;
  end;
  perform public.delete_my_filter_set(target);
  perform set_config('request.jwt.claim.sub',current_setting('qa.filter_user_1'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.filter_user_1'),'session_id',current_setting('qa.filter_session_1'),'role','authenticated')::text,true);
  if jsonb_array_length(public.list_my_filter_sets())<>2 then raise exception 'Foreign deletion accepted'; end if;
  perform public.delete_my_filter_set(target);
  perform public.delete_my_filter_set(target);
  if jsonb_array_length(public.list_my_filter_sets())<>1 then raise exception 'Deletion mismatch'; end if;
end $$;
reset role;
rollback;
select 'PASS: Dev CRUD, exact dates, retries, synchronization and two-account isolation; test data rolled back' as result;
