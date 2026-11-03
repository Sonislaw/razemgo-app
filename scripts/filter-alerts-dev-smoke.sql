-- Dev only. All accounts, notifications and deliveries are rolled back.
begin;
do $$
declare u uuid; s uuid;
begin
  for i in 1..2 loop
    u:=gen_random_uuid();s:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u::text||'@filter-alerts-test.invalid',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(s,u,now(),now());
    perform set_config('qa.alert_user_'||i,u::text,true);perform set_config('qa.alert_session_'||i,s::text,true);
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated')::text,true);
    perform public.save_my_profile(jsonb_build_object('name','Test alertów '||i,'avatar_id','trail-fox','kind','couple','adult_count',2,'child_count',0,
      'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,
      'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
  end loop;
end $$;
set local role authenticated;
do $$
declare target uuid:=gen_random_uuid(); item jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.alert_user_1'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.alert_user_1'),'session_id',current_setting('qa.alert_session_1'),'role','authenticated')::text,true);
  item:=public.save_my_filter_set(target,'trips','Alert Dev','{"landscapes":["lake"]}'::jsonb);
  if (item->>'notifications_enabled')::boolean then raise exception 'Unexpected opt-in'; end if;
  item:=public.set_my_filter_set_notifications(target,true);
  if not (item->>'notifications_enabled')::boolean then raise exception 'Opt-in failed'; end if;
  perform set_config('qa.alert_set',target::text,true);
  perform public.register_my_push_device(gen_random_uuid(),gen_random_uuid(),'ExponentPushToken[filteralertstest123456789]','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0');
  perform set_config('request.jwt.claim.sub',current_setting('qa.alert_user_2'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.alert_user_2'),'session_id',current_setting('qa.alert_session_2'),'role','authenticated')::text,true);
  begin perform public.set_my_filter_set_notifications(target,false);raise exception 'Foreign mutation accepted';exception when sqlstate 'P0002' then null;end;
  for i in 1..2 loop
    perform public.save_my_trip('{"adult_count":2,"child_count":0,"child_age_bands":[],"mode":"planned","visibility":"public",
      "start_date":"2099-05-01","end_date":"2099-05-04","location_id":"pl-locality:4259","location_name":"Chłapowo","location_region":"pomorskie",
      "location_kind":"village","campground_name":"","campground_address":"","description":"Testowy wyjazd nad jezioro do sprawdzenia alertów.",
      "travel_mode":"Kamper","interests":[],"landscape":"lake","animal_kinds":[]}'::jsonb,null,false,gen_random_uuid());
  end loop;
end $$;
reset role;
do $$
declare result jsonb; total integer;
begin
  for i in 1..10 loop
    result:=public.process_filter_notifications(10);
    select count(*) into total from notifications_private.filter_alert_items x join notifications_private.filter_alert_batches b on b.id=x.batch_id
      where b.filter_set_id=current_setting('qa.alert_set')::uuid;
    exit when total=2;
  end loop;
  if total<>2 then raise exception 'Expected two new matches';end if;
  update notifications_private.filter_alert_batches set due_at=now()-interval '1 second' where filter_set_id=current_setting('qa.alert_set')::uuid;
  perform public.process_filter_notifications(10);
end $$;
set local role authenticated;
do $$
declare page jsonb; entry jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.alert_user_1'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.alert_user_1'),'session_id',current_setting('qa.alert_session_1'),'role','authenticated')::text,true);
  page:=public.get_my_notifications();
  select v into entry from jsonb_array_elements(page->'items') v where v->>'kind'='saved_filter';
  if entry is null or (entry->>'filter_result_count')::integer<>2 or not (entry->>'available')::boolean then raise exception 'Invalid digest';end if;
  perform set_config('qa.alert_notification',entry->>'id',true);
end $$;
set local role service_role;
do $$
declare j record; found boolean:=false;
begin
  for j in select * from public.claim_push_deliveries(100) loop
    if j.notification_id=current_setting('qa.alert_notification')::uuid then
      if j.kind<>'saved_filter' or j.filter_set_id<>current_setting('qa.alert_set')::uuid or j.proposal_count<>2 then raise exception 'Invalid push payload inputs';end if;
      found:=true;
    end if;
  end loop;
  if not found then raise exception 'No digest delivery';end if;
end $$;
set local role authenticated;
select public.set_my_filter_set_notifications(current_setting('qa.alert_set')::uuid,false) is not null as disabled;
reset role;
rollback;
select 'PASS: Dev opt-in, account isolation, two publications -> one digest, push claim metadata; all test data rolled back' as result;
