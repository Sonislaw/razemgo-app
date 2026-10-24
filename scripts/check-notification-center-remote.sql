-- Only disposable fixtures are touched. pg_net requests roll back with this transaction.
begin;
set local statement_timeout='30s';
do $$ declare label text; person uuid; sid uuid; saved jsonb; begin
  foreach label in array array['a','b','c'] loop
    person:=gen_random_uuid();sid:=gen_random_uuid();
    perform set_config('razemgo.notification_'||label,person::text,true);
    perform set_config('razemgo.notification_session_'||label,sid::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(person,'authenticated','authenticated',person::text||'@notification-check.invalid','',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(sid,person,now(),now(),'aal1');
  end loop;
end $$;
set local role authenticated;
do $$ declare label text; saved jsonb; begin
  foreach label in array array['a','b','c'] loop
    perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_'||label),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_'||label),'session_id',current_setting('razemgo.notification_session_'||label))::text,true);
    saved:=public.save_my_profile(jsonb_build_object('name','Kontrola powiadomień '||label,'avatar_id','camp-bear','kind','couple','adult_count',2,'child_count',0,
      'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,
      'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
    perform set_config('razemgo.notification_group_'||label,saved->'group'->>'id',true);
  end loop;
end $$;
do $$ declare saved jsonb; begin
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_a'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_a'),'session_id',current_setting('razemgo.notification_session_a'))::text,true);
  saved:=public.save_my_trip('{
    "mode":"planned","visibility":"public","start_date":"2099-05-21","end_date":"2099-05-24",
    "location_id":"notification-check","location_name":"Chłapowo","location_region":"Pomorskie","location_kind":"village",
    "travel_mode":"Kamper","description":"Spokojny wyjazd nad morze i wspólne ognisko.","landscape":"coast","interests":[],"animal_kinds":[],"matching_group_kinds":[],"matching_child_age_bands":[]}'::jsonb);
  perform set_config('razemgo.notification_trip',saved->>'id',true);
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_b'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_b'),'session_id',current_setting('razemgo.notification_session_b'))::text,true);
  perform set_config('razemgo.notification_invitation',public.send_contact_invitation(current_setting('razemgo.notification_trip')::uuid,'Cześć, jedźmy razem!',gen_random_uuid())::text,true);
end $$;
do $$ declare data jsonb; chat uuid; begin
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_a'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_a'),'session_id',current_setting('razemgo.notification_session_a'))::text,true);
  data:=public.get_my_notifications();
  if data->>'unread_count'<>'1' or data->'items'->0->>'kind'<>'invitation_received' then raise exception 'Inbox requires a push device';end if;
  perform set_config('razemgo.notification_entry',data->'items'->0->>'id',true);
  chat:=public.respond_contact_invitation(current_setting('razemgo.notification_invitation')::uuid,'accepted');
  perform set_config('razemgo.notification_chat',chat::text,true);
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_b'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_b'),'session_id',current_setting('razemgo.notification_session_b'))::text,true);
  data:=public.get_my_notifications();
  if data->>'unread_count'<>'1' or data->'items'->0->>'kind'<>'invitation_accepted' then raise exception 'Copied invitation generated another alert';end if;
  if public.mark_my_notifications_read(array[current_setting('razemgo.notification_entry')::uuid])<>0 then raise exception 'Cross-account read';end if;
  if exists(select 1 from public.notifications where recipient_group_id=current_setting('razemgo.notification_group_a')::uuid) then raise exception 'Cross-account history';end if;
  begin update public.notification_preferences set group_id=current_setting('razemgo.notification_group_a')::uuid;raise exception 'Direct mutation allowed';exception when insufficient_privilege then null;end;
  perform public.save_my_notification_preference('messages',false);
  perform public.save_my_notification_preference('invitations',false);
  perform public.save_my_notification_preference('messages',true);
  if (public.get_my_notifications()->'preferences'->>'push_invitations')::boolean then raise exception 'Preference overwrote another field';end if;
  perform public.register_my_push_device(gen_random_uuid(),gen_random_uuid(),'ExponentPushToken['||replace(gen_random_uuid()::text,'-','')||']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0');
end $$;
do $$ declare message jsonb; begin
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_a'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_a'),'session_id',current_setting('razemgo.notification_session_a'))::text,true);
  message:=public.send_chat_message(current_setting('razemgo.notification_chat')::uuid,'Test trwałego powiadomienia.',gen_random_uuid());
  perform set_config('razemgo.notification_message',message->>'id',true);
end $$;
reset role;
do $$ declare delivery uuid; begin
  select d.id into delivery from push_private.deliveries d join push_private.events e on e.id=d.event_id
    where e.message_id=current_setting('razemgo.notification_message')::uuid;
  if delivery is null or not push_private.deliverable(delivery) then raise exception 'Enabled message has no delivery';end if;
end $$;
set local role authenticated;
do $$ declare data jsonb; entry uuid; saved bigint; begin
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_b'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_b'),'session_id',current_setting('razemgo.notification_session_b'))::text,true);
  data:=public.get_my_notifications();
  select (value->>'id')::uuid into entry from jsonb_array_elements(data->'items') where value->>'kind'='message' limit 1;
  if entry is null then raise exception 'No durable message notification';end if;
  perform public.mark_my_notifications_read(array[entry]);
  select last_read_sequence into saved from public.conversation_reads where group_id=current_setting('razemgo.notification_group_b')::uuid and conversation_id=current_setting('razemgo.notification_chat')::uuid;
  if saved<>0 then raise exception 'Notification read fabricated chat receipt';end if;
  if exists(select 1 from jsonb_array_elements(public.get_my_notifications()->'items') where value->>'id'=entry::text and value->>'read_at' is null) then raise exception 'Read not persisted';end if;
  perform public.save_my_notification_preference('messages',false);
  perform public.save_my_notification_preference('messages',true);
  perform public.mark_conversation_read(current_setting('razemgo.notification_chat')::uuid,current_setting('razemgo.notification_message')::uuid);
  if exists(select 1 from jsonb_array_elements(public.get_my_notifications()->'items') where value->>'kind'='message' and value->>'read_at' is null) then raise exception 'Chat did not acknowledge alerts';end if;
  perform set_config('request.jwt.claim.sub',current_setting('razemgo.notification_c'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('razemgo.notification_c'),'session_id',current_setting('razemgo.notification_session_c'))::text,true);
  if public.get_my_notifications()->>'unread_count'<>'0' then raise exception 'Unrelated account has inbox data';end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from push_private.deliveries d join push_private.events e on e.id=d.event_id
    where e.message_id=current_setting('razemgo.notification_message')::uuid and d.status='pending') then raise exception 'Disabled push revived';end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.get_my_notifications();raise exception 'Anonymous inbox';exception when insufficient_privilege then null;end;
  begin perform 1 from public.notification_preferences;raise exception 'Anonymous preferences';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select true as notification_center_verified,true as fixtures_rolled_back;
