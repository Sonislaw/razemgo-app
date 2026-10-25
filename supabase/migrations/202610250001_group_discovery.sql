-- Local development migration. No existing profiles are opted into the directory.
create table public.group_public_profiles (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  discoverable boolean not null default false,
  about text not null default '' check (about = btrim(about) and char_length(about) <= 600),
  updated_at timestamptz not null default now()
);
alter table public.group_public_profiles enable row level security;
revoke all on public.group_public_profiles from public, anon, authenticated;
grant select on public.group_public_profiles to authenticated;
create policy own_public_profile on public.group_public_profiles for select to authenticated
  using (group_id = (select messaging_private.my_group_id()));

create function public.get_my_group_visibility() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id();
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  return coalesce((select jsonb_build_object('discoverable',p.discoverable,'about',p.about)
    from public.group_public_profiles p where p.group_id=me), '{"discoverable":false,"about":""}'::jsonb);
end $$;
create function public.save_my_group_visibility(is_discoverable boolean, about_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); saved public.group_public_profiles;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if is_discoverable is null or about_text is null or char_length(btrim(about_text))>600 then
    raise exception 'Invalid public profile' using errcode='22023'; end if;
  insert into public.group_public_profiles(group_id,discoverable,about)
    values(me,is_discoverable,btrim(about_text)) on conflict(group_id) do update set
      discoverable=excluded.discoverable,about=excluded.about,updated_at=now() returning * into saved;
  return jsonb_build_object('discoverable',saved.discoverable,'about',saved.about);
end $$;

create function messaging_private.search_text(value text) returns text
language sql immutable set search_path='' as $$
  select lower(translate(value,'ĄĆĘŁŃÓŚŹŻąćęłńóśźż','ACELNOSZZacelnoszz'));
$$;
create function messaging_private.public_crew(g public.travel_groups) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',g.id,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,
    'adult_count',g.adult_count,'child_count',g.child_count,'child_age_bands',g.child_age_bands,
    'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds);
$$;
create function messaging_private.public_trip_count(target uuid) returns integer
language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.trip_plans t where t.group_id=target and t.status='published'
    and t.visibility='public' and t.end_date>current_date
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id);
$$;
create function public.list_public_groups(filters jsonb default '{}'::jsonb, after_name text default null, after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb; kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if jsonb_typeof(filters) is distinct from 'object' or (after_name is null)<>(after_id is null)
    or char_length(coalesce(filters->>'name',''))>80 or char_length(coalesce(after_name,''))>40 then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  with matched as (
    select g.*,p.about,messaging_private.public_trip_count(g.id) as active_trip_count,
      messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
      and (cardinality(kinds)=0 or g.kind=any(kinds))
      and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes))
      and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (after_id is null or (messaging_private.search_text(g.name),g.id)>(messaging_private.search_text(after_name),after_id))
    order by sort_name,g.id limit 21
  ), page as (select * from matched order by sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'crew',messaging_private.public_crew(g),'about',p.about,'active_trip_count',p.active_trip_count) order by p.sort_name,p.id)
      from page p join public.travel_groups g on g.id=p.id),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id) from page order by sort_name desc,id desc limit 1)) into result;
  return result;
end $$;
create function public.get_public_group(target_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); target public.travel_groups; details public.group_public_profiles;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  select * into target from public.travel_groups g where g.id=target_group_id;
  if not found or target.id=me or messaging_private.pair_blocked(me,target.id) then return null; end if;
  select * into details from public.group_public_profiles where group_id=target.id;
  if not coalesce(details.discoverable,false) and messaging_private.public_trip_count(target.id)=0
    and not exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
      and target.id in(i.sender_group_id,i.recipient_group_id) and i.status in('pending','accepted')) then return null; end if;
  return jsonb_build_object('crew',messaging_private.public_crew(target),'about',coalesce(details.about,''),
    'active_trip_count',messaging_private.public_trip_count(target.id),
    'trips',coalesce((select jsonb_agg(to_jsonb(t)) from public.list_public_trips() t where t.crew->>'id'=target.id::text),'[]'::jsonb));
end $$;

alter table public.contact_invitations
  add column context_kind text not null default 'trip' check(context_kind in('trip','profile')),
  alter column trip_reference drop not null,
  alter column trip_snapshot drop not null;
alter table public.contact_invitations add constraint invitation_context check(
  context_kind='trip' and trip_reference is not null and trip_snapshot is not null
  or context_kind='profile' and trip_id is null and source_trip_id is null and trip_reference is null and trip_snapshot is null and source_trip_snapshot is null);
create unique index profile_invitation_open on public.contact_invitations(
  least(sender_group_id,recipient_group_id),greatest(sender_group_id,recipient_group_id))
  where context_kind='profile' and status in('pending','accepted');

-- Preserve the existing trip API while protecting its request-key namespace.
create or replace function public.send_contact_invitation(target_trip_id uuid,message_text text,request_key uuid,source_trip_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); target public.trip_plans; source public.trip_plans;
  existing public.contact_invitations; saved uuid;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if request_key is null or char_length(btrim(coalesce(message_text,''))) not between 1 and 500 then
    raise exception 'Invalid invitation' using errcode='22023'; end if;
  -- Serialize keys as well as pairs, including simultaneous profile/trip requests.
  perform pg_advisory_xact_lock(hashtextextended(me::text||':'||request_key::text,1));
  select * into existing from public.contact_invitations i where i.sender_group_id=me and i.request_key=send_contact_invitation.request_key;
  if found then
    if existing.context_kind<>'trip' or existing.trip_reference is distinct from target_trip_id then
      raise exception 'Request key reused' using errcode='22023'; end if;
    return existing.id;
  end if;
  select * into target from public.trip_plans t where t.id=target_trip_id;
  if not found or target.group_id=me then raise exception 'Trip unavailable' using errcode='P0002'; end if;
  perform messaging_private.lock_pair(me,target.group_id);
  select * into existing from public.contact_invitations i where i.sender_group_id=me and i.trip_reference=target_trip_id
    and i.context_kind='trip' and i.status in('pending','accepted');
  if found then return existing.id; end if;
  if messaging_private.pair_blocked(me,target.group_id) then raise exception 'Contact blocked' using errcode='42501'; end if;
  select * into target from public.trip_plans t where t.id=target_trip_id for share;
  if not found or target.status<>'published' or target.visibility<>'public' or target.end_date<=current_date then
    raise exception 'Trip unavailable' using errcode='P0002'; end if;
  if source_trip_id is not null then
    select * into source from public.trip_plans t where t.id=source_trip_id and t.group_id=me for share;
    if not found or source.status<>'published' or source.visibility<>'public' or source.end_date<=current_date then
      raise exception 'Source trip unavailable' using errcode='P0002'; end if;
  end if;
  if (select count(*) from public.contact_invitations i where i.sender_group_id=me and i.recipient_group_id=target.group_id
    and i.created_at>now()-interval '1 hour')>=5 then raise exception 'Invitation limit reached' using errcode='54000'; end if;
  insert into public.contact_invitations(sender_group_id,recipient_group_id,trip_id,source_trip_id,trip_reference,trip_snapshot,source_trip_snapshot,text,request_key)
    values(me,target.group_id,target.id,source.id,target.id,messaging_private.trip_snapshot(target),
      case when source.id is not null then messaging_private.trip_snapshot(source) end,btrim(message_text),request_key) returning id into saved;
  perform messaging_private.touch_pair(me,target.group_id);
  return saved;
end $$;
create function public.send_profile_invitation(target_group_id uuid,message_text text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); previous public.contact_invitations; saved uuid;
begin
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

alter table public.account_reports drop constraint account_reports_target_kind_check;
alter table public.account_reports add constraint account_reports_target_kind_check check(target_kind in('trip','conversation','profile'));

-- A visible public profile can be blocked before either side sends an invitation.
create or replace function public.set_group_block(target_group_id uuid,blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id();
begin
  if me is null or target_group_id=me then raise exception 'Not permitted' using errcode='42501'; end if;
  if target_group_id is null or blocked is null then raise exception 'Invalid block' using errcode='22023'; end if;
  perform messaging_private.lock_pair(me,target_group_id);
  if not exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
      and target_group_id in(i.sender_group_id,i.recipient_group_id))
    and not exists(select 1 from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=target_group_id)
    and public.get_public_group(target_group_id) is null then raise exception 'Contact unavailable' using errcode='P0002'; end if;
  if blocked then
    insert into public.group_blocks(blocker_group_id,blocked_group_id) values(me,target_group_id) on conflict do nothing;
    update public.contact_invitations i set status='declined',updated_at=now() where i.status='pending'
      and me in(i.sender_group_id,i.recipient_group_id) and target_group_id in(i.sender_group_id,i.recipient_group_id);
  else delete from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=target_group_id; end if;
  perform messaging_private.touch_pair(me,target_group_id);
end $$;

create or replace function public.get_my_mailbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'invitations',coalesce((select jsonb_agg(to_jsonb(i)-'request_key' order by i.created_at desc,i.id)
      from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'invitation_id',c.invitation_id,'sender_group_id',c.sender_group_id,'recipient_group_id',c.recipient_group_id,
      'updated_at',c.updated_at,'blocked',messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id),
      'self_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0),
      'other_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id<>me),0),
      'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_group_id<>me
        and m.sequence>coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0)),
      'last_message',(select to_jsonb(m) from public.chat_messages m where m.conversation_id=c.id order by m.sequence desc limit 1)
    ) order by c.updated_at desc,c.id) from public.conversations c where me in(c.sender_group_id,c.recipient_group_id)),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'avatar_id',g.avatar_id,'adult_count',g.adult_count))
      from public.travel_groups g where g.id<>me and (
        exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id) and g.id in(i.sender_group_id,i.recipient_group_id))
        or exists(select 1 from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=g.id))),'[]'::jsonb),
    'blocked_group_ids',coalesce((select jsonb_agg(b.blocked_group_id) from public.group_blocks b where b.blocker_group_id=me),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'group_id',r.reported_group_id,'conversation_id',r.conversation_id,'reason',r.reason))
      from public.account_reports r where r.reporter_group_id=me),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.report_profile(target_group_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); previous public.account_reports; target jsonb; saved uuid;
begin
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

revoke all on function messaging_private.search_text(text),messaging_private.public_crew(public.travel_groups),
  messaging_private.public_trip_count(uuid) from public,anon,authenticated;
revoke all on function public.get_my_group_visibility(),public.save_my_group_visibility(boolean,text),
  public.list_public_groups(jsonb,text,uuid),public.get_public_group(uuid),public.send_profile_invitation(uuid,text,uuid),
  public.send_contact_invitation(uuid,text,uuid,uuid),public.report_profile(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.get_my_group_visibility(),public.save_my_group_visibility(boolean,text),
  public.list_public_groups(jsonb,text,uuid),public.get_public_group(uuid),public.send_profile_invitation(uuid,text,uuid),
  public.send_contact_invitation(uuid,text,uuid,uuid),public.report_profile(uuid,text,uuid) to authenticated;

notify pgrst,'reload schema';
