-- All fixture writes (including pg_net wakeups) are rolled back. No push is sent.
begin;
set local statement_timeout='20s';
do $$ declare label text; person uuid; sid uuid; begin
  foreach label in array array['a','b','c'] loop
    person:=gen_random_uuid();sid:=gen_random_uuid();
    perform set_config('razemgo.push_'||label,person::text,true);
    perform set_config('razemgo.push_session_'||label,sid::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(person,'authenticated','authenticated',person::text||'@push-check.invalid','',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(sid,person,now(),now(),'aal1');
  end loop;
end $$;
set local role authenticated;
do $$ declare label text; saved jsonb; begin
  foreach label in array array['a','b','c'] loop
    perform set_config('request.jwt.claim.sub',current_setting('razemgo.push_'||label),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_'||label),'session_id',current_setting('razemgo.push_session_'||label))::text,true);
    saved:=public.save_my_profile(jsonb_build_object('name','Kontrola push '||label,'avatar_id','camp-bear','kind','couple','adult_count',2,'child_count',0,
      'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,
      'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
    perform set_config('razemgo.push_group_'||label,saved->'group'->>'id',true);
    if label in('a','b') then
      perform public.register_my_push_device(gen_random_uuid(),gen_random_uuid(),'ExponentPushToken['||replace(gen_random_uuid()::text,'-','')||']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0');
    end if;
  end loop;
  begin perform public.claim_push_deliveries(30);raise exception 'Public dispatcher access';exception when insufficient_privilege then null;end;
  begin perform 1 from public.push_devices;raise exception 'Device token access';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.push_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_a'),'session_id',current_setting('razemgo.push_session_a'))::text,true);
do $$ declare saved jsonb; begin
  saved:=public.save_my_trip('{
    "mode":"planned","visibility":"public","start_date":"2099-05-21","end_date":"2099-05-24",
    "location_id":"push-check","location_name":"Chłapowo","location_region":"Pomorskie","location_kind":"village","campground_name":"","campground_address":"",
    "travel_mode":"Kamper","description":"Spokojny wyjazd nad morze i wspólne ognisko.","landscape":"coast","interests":[],"animal_kinds":[],"matching_group_kinds":[],"matching_child_age_bands":[]}'::jsonb);
  perform set_config('razemgo.push_trip',saved->>'id',true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.push_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_b'),'session_id',current_setting('razemgo.push_session_b'))::text,true);
do $$ declare invitation uuid; token uuid:=gen_random_uuid(); begin
  invitation:=public.send_contact_invitation(current_setting('razemgo.push_trip')::uuid,'Cześć, spotkajmy się!',token);
  if public.send_contact_invitation(current_setting('razemgo.push_trip')::uuid,'Cześć, spotkajmy się!',token)<>invitation then raise exception 'Invitation retry failed';end if;
  perform set_config('razemgo.push_invitation',invitation::text,true);
end $$;
set local role service_role;
do $$ declare jobs integer:=0;job record;begin
  for job in select * from public.claim_push_deliveries(30) loop
    if job.kind<>'invitation_received' or job.recipient_group_id<>current_setting('razemgo.push_group_a')::uuid then raise exception 'Incorrect invitation target';end if;
    perform public.finish_push_delivery(job.delivery_id,job.claim_key,'sent',job.push_token);
    jobs:=jobs+1;
  end loop;
  if jobs<>1 then raise exception 'Incorrect invitation count: %',jobs;end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('razemgo.push_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_a'),'session_id',current_setting('razemgo.push_session_a'))::text,true);
do $$ declare chat uuid; begin
  chat:=public.respond_contact_invitation(current_setting('razemgo.push_invitation')::uuid,'accepted');
  perform set_config('razemgo.push_chat',chat::text,true);
  perform public.respond_contact_invitation(current_setting('razemgo.push_invitation')::uuid,'accepted');
end $$;
set local role service_role;
do $$ declare jobs integer:=0;job record;begin
  for job in select * from public.claim_push_deliveries(30) loop
    if job.kind<>'invitation_accepted' or job.recipient_group_id<>current_setting('razemgo.push_group_b')::uuid then raise exception 'Incorrect acceptance target';end if;
    perform public.finish_push_delivery(job.delivery_id,job.claim_key,'sent',job.push_token);jobs:=jobs+1;
  end loop;
  if jobs<>1 then raise exception 'Duplicate acceptance or invitation text alert';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('razemgo.push_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_a'),'session_id',current_setting('razemgo.push_session_a'))::text,true);
do $$ declare message jsonb;begin
  message:=public.send_chat_message(current_setting('razemgo.push_chat')::uuid,'Wiadomość do odczytania.',gen_random_uuid());
  perform set_config('razemgo.push_message',message->>'id',true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.push_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.push_b'),'session_id',current_setting('razemgo.push_session_b'))::text,true);
select public.mark_conversation_read(current_setting('razemgo.push_chat')::uuid,current_setting('razemgo.push_message')::uuid);
set local role service_role;
do $$ begin if exists(select 1 from public.claim_push_deliveries(30)) then raise exception 'Read message was pushed';end if;end $$;
set local role anon;
do $$ begin
  begin perform public.claim_push_deliveries(30);raise exception 'Anonymous dispatch';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from cron.job where jobname='razemgo-dispatch-push' and active) then raise exception 'Missing dispatcher schedule';end if;
  if not exists(select 1 from cron.job where jobname='razemgo-push-cleanup' and active) then raise exception 'Missing cleanup schedule';end if;
end $$;
rollback;
select true as remote_push_outbox_verified,true as fixtures_rolled_back;
