-- All accounts, reports, decisions, audit entries and pg_net wakeups roll back.
begin;
do $$ declare label text; person uuid; sid uuid;begin
  foreach label in array array['admin','owner','reporter'] loop
    person:=gen_random_uuid();sid:=gen_random_uuid();
    perform set_config('razemgo.mod_'||label,person::text,true);perform set_config('razemgo.mod_session_'||label,sid::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(person,'authenticated','authenticated',person::text||'@moderation-check.invalid','',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(sid,person,now(),now(),'aal1');
  end loop;
  insert into moderation_private.administrators(user_id) values(current_setting('razemgo.mod_admin')::uuid);
end $$;
set local role authenticated;
do $$ declare label text;saved jsonb;begin
  foreach label in array array['admin','owner','reporter'] loop
    perform set_config('request.jwt.claim.sub',current_setting('razemgo.mod_'||label),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.mod_'||label),'session_id',current_setting('razemgo.mod_session_'||label))::text,true);
    saved:=public.save_my_profile(jsonb_build_object('name','Moderation check '||label,'avatar_id','camp-bear','kind','couple','adult_count',2,'child_count',0,
      'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,
      'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
    perform set_config('razemgo.mod_group_'||label,saved->'group'->>'id',true);
  end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_owner'),true);
do $$ declare saved jsonb;begin
  saved:=public.save_my_trip('{"mode":"planned","visibility":"public","start_date":"2099-05-21","end_date":"2099-05-24",
    "location_id":"moderation-check","location_name":"Test","location_region":"Test","location_kind":"village","campground_name":"","campground_address":"",
    "travel_mode":"Kamper","description":"A fictional trip for a moderation check.","landscape":"coast","interests":[],"animal_kinds":[],"matching_group_kinds":[],"matching_child_age_bands":[]}'::jsonb);
  perform set_config('razemgo.mod_trip',saved->>'id',true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_reporter'),true);
do $$ declare reported uuid;begin
  reported:=public.report_trip(current_setting('razemgo.mod_trip')::uuid,'Spam',gen_random_uuid());
  perform set_config('razemgo.mod_report',reported::text,true);
  begin perform public.admin_report_detail(reported);raise exception 'Ordinary account read evidence';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_admin'),true);
do $$ declare report uuid:=current_setting('razemgo.mod_report')::uuid;detail jsonb;key uuid:=gen_random_uuid();begin
  detail:=public.admin_report_detail(report);
  detail:=public.admin_apply_action(report,'hide_trip','Verified remote moderation test.',key,(detail->'report'->>'updated_at')::timestamptz);
  if not (detail->>'trip_hidden')::boolean then raise exception 'Trip not hidden';end if;
  detail:=public.admin_apply_action(report,'suspend_account','Verified remote suspension test.',gen_random_uuid(),(detail->'report'->>'updated_at')::timestamptz);
  if not (detail->>'account_suspended')::boolean then raise exception 'Account not suspended';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_owner'),true);
do $$ begin
  if not (public.get_my_account_access()->>'suspended')::boolean then raise exception 'Suspension not visible';end if;
  if exists(select 1 from public.travel_groups) then raise exception 'Suspended account bypassed RLS';end if;
  begin perform public.get_my_mailbox();raise exception 'Suspended RPC access';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_reporter'),true);
do $$ begin
  if exists(select 1 from public.list_public_trips(current_setting('razemgo.mod_trip')::uuid)) then raise exception 'Moderated trip visible';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.mod_admin'),true);
do $$ declare report uuid:=current_setting('razemgo.mod_report')::uuid;detail jsonb;begin
  detail:=public.admin_report_detail(report);
  detail:=public.admin_apply_action(report,'restore_account','Restored in rolled back test.',gen_random_uuid(),(detail->'report'->>'updated_at')::timestamptz);
  detail:=public.admin_apply_action(report,'restore_trip','Restored in rolled back test.',gen_random_uuid(),(detail->'report'->>'updated_at')::timestamptz);
  if jsonb_array_length(detail->'history')<>4 then raise exception 'Audit history incomplete';end if;
end $$;
rollback;
select true as moderation_permissions_actions_and_audit_verified,true as all_fixtures_rolled_back;
