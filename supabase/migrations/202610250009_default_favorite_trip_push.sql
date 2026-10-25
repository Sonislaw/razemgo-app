-- Match message/invitation defaults. Preserve every already saved preference;
-- changing the default never replays historical notifications or deliveries.
alter table public.notification_preferences alter column push_favorite_trips set default true;

create or replace function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case event_kind when 'message' then p.push_messages
    when 'favorite_trip' then p.push_favorite_trips
    when 'invitation_received' then p.push_invitations when 'invitation_accepted' then p.push_invitations
    else false end from public.notification_preferences p where p.group_id=recipient),
    event_kind in('message','invitation_received','invitation_accepted','favorite_trip'));
$$;

create or replace function public.save_my_notification_preference(preference_key text,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); saved public.notification_preferences;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if preference_key is null or preference_key not in('messages','invitations','favorite_trips') or enabled is null
    then raise exception 'Invalid preference' using errcode='22023'; end if;
  insert into public.notification_preferences(group_id,push_messages,push_invitations,push_favorite_trips)
    values(me,case when preference_key='messages' then enabled else true end,
      case when preference_key='invitations' then enabled else true end,
      case when preference_key='favorite_trips' then enabled else true end)
    on conflict(group_id) do update set
      push_messages=case when preference_key='messages' then enabled else public.notification_preferences.push_messages end,
      push_invitations=case when preference_key='invitations' then enabled else public.notification_preferences.push_invitations end,
      push_favorite_trips=case when preference_key='favorite_trips' then enabled else public.notification_preferences.push_favorite_trips end,
      updated_at=now() returning * into saved;
  if not enabled then
    update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='PreferenceDisabled'
      from push_private.events e where e.id=d.event_id and e.recipient_group_id=me and d.ticket_id is null
      and d.status in('pending','sending') and (preference_key='messages' and e.kind='message'
        or preference_key='invitations' and e.kind in('invitation_received','invitation_accepted')
        or preference_key='favorite_trips' and e.kind='favorite_trip');
  end if;
  return to_jsonb(saved)-'group_id';
end;
$$;

create or replace function public.get_my_notifications(before_at timestamptz default null,before_id uuid default null,
  page_size integer default 30,only_unread boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb; take integer:=greatest(1,least(coalesce(page_size,30),50));
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if (before_at is null)<>(before_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
  if before_at is null then perform notifications_private.refresh_proposals(me); end if;
  with page as (
    select n.* from public.notifications n where n.recipient_group_id=me
      and not messaging_private.pair_blocked(me,n.actor_group_id)
      and (not coalesce(only_unread,false) or n.read_at is null)
      and (before_at is null or (n.created_at,n.id)<(before_at,before_id))
      order by n.created_at desc,n.id desc limit take+1
  ), entries as (
    select n.id,n.kind,n.created_at,n.read_at,n.actor_group_id,g.name as actor_name,g.avatar_id as actor_avatar_id,
      n.trip_label,n.own_trip_id,n.proposed_trip_id,n.invitation_id,
      coalesce(n.conversation_id,(select c.id from public.conversations c where c.invitation_id=n.invitation_id)) as conversation_id,
      case when n.kind='favorite_trip' then favorites_private.can_view_trip(me,n.proposed_trip_id)
      when n.kind='proposal' then exists(select 1 from public.trip_plans p join public.trip_plans o on o.id=n.own_trip_id
        where p.id=n.proposed_trip_id and p.status='published' and p.visibility='public' and p.end_date>current_date
          and o.group_id=me and o.status='published' and o.visibility='public' and o.end_date>current_date)
      when n.kind='invitation_received' then n.invitation_id is not null
      else n.conversation_id is not null end as available
      from page n join public.travel_groups g on g.id=n.actor_group_id
      order by n.created_at desc,n.id desc limit take
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from entries e),'[]'::jsonb),
    'has_more',(select count(*)>take from page),
    'unread_count',(select count(*) from public.notifications n where n.recipient_group_id=me and n.read_at is null
      and not messaging_private.pair_blocked(me,n.actor_group_id)),
    'preferences',coalesce((select to_jsonb(p)-'group_id' from public.notification_preferences p where p.group_id=me),
      jsonb_build_object('push_messages',true,'push_invitations',true,'push_favorite_trips',true,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end;
$$;
notify pgrst,'reload schema';
