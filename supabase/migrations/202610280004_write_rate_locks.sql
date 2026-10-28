-- Preserve existing limits and idempotency under concurrent requests.
create or replace function public.send_profile_invitation(target_group_id uuid,message_text text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); previous public.contact_invitations; saved uuid;
begin
  -- Count and write share one account lock across different targets/keys.
  perform pg_advisory_xact_lock(hashtextextended('invitation-rate:'||me::text,19));
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if request_key is null or char_length(btrim(coalesce(message_text,''))) not between 1 and 500 then
    raise exception 'Invalid invitation' using errcode='22023'; end if;
  if target_group_id is null or target_group_id=me then raise exception 'Profile unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text||':'||request_key::text,1));
  perform messaging_private.lock_pair(me,target_group_id);
  if messaging_private.pair_blocked(me,target_group_id) then raise exception 'Contact blocked' using errcode='42501'; end if;
  select * into previous from public.contact_invitations i where i.sender_group_id=me and i.request_key=send_profile_invitation.request_key;
  if found then
    if previous.context_kind<>'profile' or previous.recipient_group_id<>target_group_id then
      raise exception 'Request key reused' using errcode='22023'; end if;
    return previous.id;
  end if;
  select * into previous from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
    and target_group_id in(i.sender_group_id,i.recipient_group_id) and i.status in('pending','accepted')
    order by (i.status='accepted') desc,i.created_at desc limit 1;
  if found then return previous.id; end if;
  if public.get_public_group(target_group_id) is null then raise exception 'Profile unavailable' using errcode='P0002'; end if;
  if (select count(*) from public.contact_invitations i where i.sender_group_id=me and i.created_at>now()-interval '1 day')>=100
    or (select count(*) from public.contact_invitations i where i.sender_group_id=me and i.recipient_group_id=target_group_id
      and i.created_at>now()-interval '1 hour')>=5 then raise exception 'Invitation limit reached' using errcode='54000'; end if;
  insert into public.contact_invitations(sender_group_id,recipient_group_id,context_kind,text,request_key)
    values(me,target_group_id,'profile',btrim(message_text),request_key) returning id into saved;
  perform messaging_private.touch_pair(me,target_group_id);
  return saved;
end $$;

create or replace function public.report_trip(target_trip_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); target public.trip_plans; previous public.account_reports; saved uuid;
begin
  -- Count and write share one account lock across different targets/keys.
  perform pg_advisory_xact_lock(hashtextextended('report-rate:'||me::text,19));
  if me is null then raise exception 'Profile required' using errcode='42501';end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023';end if;
  select * into previous from public.account_reports r where r.reporter_group_id=me and r.request_key=report_trip.request_key;
  if found then
    if previous.target_kind<>'trip' or previous.trip_id is distinct from target_trip_id then raise exception 'Request key reused' using errcode='22023';end if;
    return previous.id;
  end if;
  select * into target from public.trip_plans t where t.id=target_trip_id for share;
  if not found or target.group_id=me or target.status<>'published' or target.visibility<>'public'
    or target.end_date<=current_date or messaging_private.pair_blocked(me,target.group_id)
    or exists(select 1 from moderation_private.hidden_trips h where h.trip_id=target.id) then raise exception 'Trip unavailable' using errcode='P0002';end if;
  if (select count(*) from public.account_reports where reporter_group_id=me and created_at>now()-interval '1 day')>=20 then
    raise exception 'Report limit reached' using errcode='54000';end if;
  insert into public.account_reports(reporter_group_id,reported_group_id,trip_id,target_kind,reason,request_key,evidence)
    values(me,target.group_id,target.id,'trip',report_reason,request_key,jsonb_build_object('trip',moderation_private.trip_evidence(target)))
    on conflict on constraint account_reports_reporter_group_id_request_key_key do update set request_key=excluded.request_key returning id into saved;
  return saved;
end $$;

create or replace function public.report_conversation(conversation_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); chat public.conversations; previous public.account_reports; saved uuid; target public.trip_plans;
begin
  -- Count and write share one account lock across different targets/keys.
  perform pg_advisory_xact_lock(hashtextextended('report-rate:'||me::text,19));
  if me is null then raise exception 'Profile required' using errcode='42501';end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023';end if;
  select * into previous from public.account_reports r where r.reporter_group_id=me and r.request_key=report_conversation.request_key;
  if found then
    if previous.target_kind<>'conversation' or previous.conversation_id is distinct from conversation_id then raise exception 'Request key reused' using errcode='22023';end if;
    return previous.id;
  end if;
  select * into chat from public.conversations c where c.id=conversation_id and me in(c.sender_group_id,c.recipient_group_id);
  if not found then raise exception 'Conversation unavailable' using errcode='42501';end if;
  if (select count(*) from public.account_reports where reporter_group_id=me and created_at>now()-interval '1 day')>=20 then
    raise exception 'Report limit reached' using errcode='54000';end if;
  select t.* into target from public.contact_invitations i join public.trip_plans t on t.id=i.trip_id where i.id=chat.invitation_id;
  insert into public.account_reports(reporter_group_id,reported_group_id,conversation_id,trip_id,reason,request_key,evidence)
    values(me,case when me=chat.sender_group_id then chat.recipient_group_id else chat.sender_group_id end,chat.id,target.id,report_reason,request_key,
      jsonb_build_object('trip',case when target.id is not null then moderation_private.trip_evidence(target) end,'messages',coalesce((select jsonb_agg(e) from
        (select m.id,m.sender_group_id,m.text,m.created_at from public.chat_messages m where m.conversation_id=chat.id order by m.sequence desc limit 20) e),'[]'::jsonb)))
    on conflict on constraint account_reports_reporter_group_id_request_key_key do update set request_key=excluded.request_key returning id into saved;
  return saved;
end $$;

create or replace function public.report_profile(target_group_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); previous public.account_reports; target jsonb; saved uuid;
begin
  -- Count and write share one account lock across different targets/keys.
  perform pg_advisory_xact_lock(hashtextextended('report-rate:'||me::text,19));
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text||':'||request_key::text,2));
  select * into previous from public.account_reports r where r.reporter_group_id=me and r.request_key=report_profile.request_key;
  if found then
    if previous.target_kind<>'profile' or previous.reported_group_id is distinct from target_group_id then
      raise exception 'Request key reused' using errcode='22023'; end if;
    return previous.id;
  end if;
  target:=public.get_public_group(target_group_id);
  if target is null then raise exception 'Profile unavailable' using errcode='P0002'; end if;
  if (select count(*) from public.account_reports where reporter_group_id=me and created_at>now()-interval '1 day')>=20 then
    raise exception 'Report limit reached' using errcode='54000'; end if;
  insert into public.account_reports(reporter_group_id,reported_group_id,target_kind,reason,request_key,evidence)
    values(me,target_group_id,'profile',report_reason,request_key,jsonb_build_object('profile',jsonb_build_object(
      'name',target->'crew'->>'name','avatar_id',target->'crew'->>'avatar_id','about',target->>'about'))) returning id into saved;
  return saved;
end $$;
