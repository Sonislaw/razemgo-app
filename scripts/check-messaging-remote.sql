-- Run against the linked test project. Every fixture and action is rolled back.
begin;
set local statement_timeout = '20s';
do $$ declare person uuid; label text; begin
  foreach label in array array['a','b','c'] loop
    person:=gen_random_uuid();
    perform set_config('razemgo.messaging_'||label,person::text,true);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(person,'authenticated','authenticated',person::text||'@messaging-check.invalid','',now(),'{}','{}',now(),now());
  end loop;
end $$;
set local role authenticated;
do $$ declare label text; saved jsonb; begin
  foreach label in array array['a','b','c'] loop
    perform set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_'||label),true);
    saved:=public.save_my_profile(jsonb_build_object('name','Kontrola czatu '||label,'avatar_id','camp-bear','kind','couple',
      'adult_count',2,'child_count',0,'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,
      'animal_kinds','[]'::jsonb,'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
    perform set_config('razemgo.messaging_group_'||label,saved->'group'->>'id',true);
  end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_a'),true);
do $$ declare saved jsonb; begin
  saved:=public.save_my_trip('{
    "mode":"planned","visibility":"public","start_date":"2099-05-21","end_date":"2099-05-24",
    "location_id":"pl-locality:messaging-check","location_name":"Chłapowo","location_region":"Pomorskie","location_kind":"village",
    "campground_name":"Kontrola czatu","campground_address":"","travel_mode":"Kamper",
    "description":"Spokojny wyjazd nad morze, rowery i wspólne ognisko.","landscape":"coast","interests":[],
    "animal_kinds":[],"matching_group_kinds":[],"matching_child_age_bands":[]}'::jsonb);
  perform set_config('razemgo.messaging_trip',saved->>'id',true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_b'),true);
do $$ declare token uuid:=gen_random_uuid(); invitation uuid; begin
  invitation:=public.send_contact_invitation(current_setting('razemgo.messaging_trip')::uuid,'Cześć, spotkajmy się!',token);
  if public.send_contact_invitation(current_setting('razemgo.messaging_trip')::uuid,'Cześć, spotkajmy się!',token)<>invitation then raise exception 'Duplicate invitation'; end if;
  perform set_config('razemgo.messaging_invitation',invitation::text,true);
  begin perform public.respond_contact_invitation(invitation,'accepted'); raise exception 'Sender accepted own request';
    exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_a'),true);
do $$ declare chat uuid; token uuid:=gen_random_uuid(); message jsonb; begin
  chat:=public.respond_contact_invitation(current_setting('razemgo.messaging_invitation')::uuid,'accepted');
  if public.respond_contact_invitation(current_setting('razemgo.messaging_invitation')::uuid,'accepted')<>chat then raise exception 'Duplicate conversation'; end if;
  perform set_config('razemgo.messaging_chat',chat::text,true);
  message:=public.send_chat_message(chat,'Do zobaczenia!',token);
  if public.send_chat_message(chat,'Do zobaczenia!',token)->>'id'<>message->>'id' then raise exception 'Duplicate message'; end if;
  perform set_config('razemgo.messaging_message',message->>'id',true);
  if public.get_my_mailbox()->'contacts'->0 ? 'child_count' then raise exception 'Child data entered chat'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_b'),true);
do $$ declare box jsonb; begin
  box:=public.get_my_mailbox();
  if (box->'conversations'->0->>'unread_count')::integer<>1 then raise exception 'Unread count failed'; end if;
  perform public.mark_conversation_read(current_setting('razemgo.messaging_chat')::uuid,current_setting('razemgo.messaging_message')::uuid);
  if (public.get_my_mailbox()->'conversations'->0->>'unread_count')::integer<>0 then raise exception 'Read receipt failed'; end if;
  perform public.report_conversation(current_setting('razemgo.messaging_chat')::uuid,'Spam',gen_random_uuid());
  perform public.set_group_block(current_setting('razemgo.messaging_group_a')::uuid,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_a'),true);
do $$ begin
  begin perform public.send_chat_message(current_setting('razemgo.messaging_chat')::uuid,'Blocked',gen_random_uuid()); raise exception 'Block failed';
    exception when insufficient_privilege then null; end;
  if exists(select 1 from public.list_public_trips() where trip->>'group_id'=current_setting('razemgo.messaging_group_b')) then raise exception 'Blocked discovery'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('razemgo.messaging_c'),true);
do $$ begin
  if exists(select 1 from public.conversations where id=current_setting('razemgo.messaging_chat')::uuid) then raise exception 'Conversation leaked'; end if;
  if exists(select 1 from public.chat_messages where conversation_id=current_setting('razemgo.messaging_chat')::uuid) then raise exception 'Message leaked'; end if;
  begin perform public.get_conversation_messages(current_setting('razemgo.messaging_chat')::uuid); raise exception 'History leaked';
    exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.get_my_mailbox(); raise exception 'Anonymous mailbox'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare item text; begin
  foreach item in array array['mailbox_updates'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then
      raise exception 'Missing Realtime publication: %',item;
    end if;
  end loop;
end $$;
rollback;
select true as remote_messaging_verified, true as fixtures_rolled_back;
