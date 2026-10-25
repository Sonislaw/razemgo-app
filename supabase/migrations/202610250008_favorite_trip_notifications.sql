-- A favorite crew's first public publication creates a durable inbox entry.
-- Phone delivery is a separate, explicitly enabled preference.
alter table public.notification_preferences add column push_favorite_trips boolean not null default false;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check(kind in('message','invitation_received','invitation_accepted','proposal','favorite_trip'));
alter table push_private.events drop constraint events_kind_check;
alter table push_private.events add constraint events_kind_check
  check(kind in('invitation_received','invitation_accepted','message','favorite_trip'));

-- One publication per trip, even if there were no followers at publication time.
-- Existing publications are history, never a reason to send a new alert on resume.
create table notifications_private.favorite_trip_publications (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade
);
alter table notifications_private.favorite_trip_publications enable row level security;
revoke all on notifications_private.favorite_trip_publications from public,anon,authenticated;
insert into notifications_private.favorite_trip_publications(trip_id)
  select id from public.trip_plans where published_at is not null;

create or replace function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case event_kind when 'message' then p.push_messages
    when 'favorite_trip' then p.push_favorite_trips
    when 'invitation_received' then p.push_invitations when 'invitation_accepted' then p.push_invitations
    else false end from public.notification_preferences p where p.group_id=recipient),
    event_kind in('message','invitation_received','invitation_accepted'));
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
      case when preference_key='favorite_trips' then enabled else false end)
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

create function notifications_private.favorite_trip_published() returns trigger
language plpgsql security definer set search_path='' as $$
declare first_publication uuid; queued integer;
begin
  if new.status<>'published' or new.visibility<>'public' or new.end_date<=current_date then return new; end if;
  if tg_op='UPDATE' and old.status='published' and old.visibility='public' then return new; end if;
  insert into notifications_private.favorite_trip_publications(trip_id) values(new.id)
    on conflict do nothing returning trip_id into first_publication;
  if first_publication is null then return new; end if;
  with entries as (
    insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,proposed_trip_id,trip_label)
      select f.owner_group_id,new.group_id,'favorite_trip',new.id,new.id,
        left(regexp_replace(new.description,'\s+',' ','g'),180)
      from favorites_private.group_favorites f where f.target_group_id=new.group_id
        and favorites_private.can_view_trip(f.owner_group_id,new.id)
      on conflict do nothing returning *
  ), events as (
    insert into push_private.events(id,kind,source_id,recipient_group_id,actor_group_id)
      select n.id,n.kind,n.source_id,n.recipient_group_id,n.actor_group_id from entries n
      where notifications_private.push_allowed(n.recipient_group_id,'favorite_trip')
        and exists(select 1 from public.push_devices d where d.group_id=n.recipient_group_id)
      on conflict do nothing returning id,recipient_group_id
  ) insert into push_private.deliveries(event_id,device_id)
    select e.id,d.id from events e join public.push_devices d on d.group_id=e.recipient_group_id
    on conflict do nothing;
  get diagnostics queued=row_count;
  if queued>0 then begin perform push_private.wake_dispatcher(); exception when others then null; end; end if;
  return new;
end;
$$;
create trigger favorite_trip_published after insert or update of status,visibility on public.trip_plans
  for each row execute function notifications_private.favorite_trip_published();

-- Removing and re-adding a favorite must not revive an old queued phone alert.
create function notifications_private.favorite_group_removed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='FavoriteRemoved'
    from push_private.events e where e.id=d.event_id and e.kind='favorite_trip'
      and e.recipient_group_id=old.owner_group_id and e.actor_group_id=old.target_group_id
      and d.ticket_id is null and d.status in('pending','sending');
  return old;
end;
$$;
create trigger favorite_group_removed after delete on favorites_private.group_favorites
  for each row execute function notifications_private.favorite_group_removed();

create or replace function push_private.deliverable(delivery uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from push_private.deliveries x
    join push_private.events e on e.id=x.event_id join public.push_devices d on d.id=x.device_id
    join auth.sessions s on s.id=d.session_id
    where x.id=delivery and d.group_id=e.recipient_group_id and (s.not_after is null or s.not_after>now())
      and e.expires_at>now() and not messaging_private.pair_blocked(e.recipient_group_id,e.actor_group_id)
      and notifications_private.push_allowed(e.recipient_group_id,e.kind)
      and not exists(select 1 from public.notifications n where n.id=e.id and n.read_at is not null)
      and (
        e.kind='invitation_received' and exists(select 1 from public.contact_invitations i where i.id=e.invitation_id and i.status='pending')
        or e.kind='invitation_accepted' and exists(select 1 from public.conversations c where c.id=e.conversation_id)
        or e.kind='message' and exists(select 1 from public.chat_messages m where m.id=e.message_id and m.sequence>
          coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=e.conversation_id and r.group_id=e.recipient_group_id),0))
        or e.kind='favorite_trip' and favorites_private.can_view_trip(e.recipient_group_id,e.source_id)
          and exists(select 1 from favorites_private.group_favorites f
            where f.owner_group_id=e.recipient_group_id and f.target_group_id=e.actor_group_id)
      ));
$$;

-- Append trip_id to the worker API. Existing fields and leases are unchanged.
drop function public.claim_push_deliveries(integer);
create function public.claim_push_deliveries(batch_size integer default 30)
returns table(delivery_id uuid,event_id uuid,device_id uuid,push_token text,kind text,recipient_group_id uuid,
  invitation_id uuid,conversation_id uuid,ticket_id text,claim_key uuid,attempts integer,trip_id uuid)
language plpgsql security definer set search_path='' as $$
declare item push_private.deliveries; lease uuid;
begin
  delete from push_private.events where expires_at<now()-interval '7 days';
  for item in select d.* from push_private.deliveries d
    where (d.status in('pending','ticketed') and d.due_at<=now())
      or (d.status in('sending','checking') and d.claimed_at<now()-interval '2 minutes')
    order by d.due_at,d.id for update skip locked limit greatest(1,least(coalesce(batch_size,30),100)) loop
    if item.attempts>=8 or not push_private.deliverable(item.id) then
      update push_private.deliveries set status='skipped',claim_key=null where id=item.id;
      continue;
    end if;
    lease:=gen_random_uuid();
    update push_private.deliveries set status=case when item.ticket_id is null then 'sending' else 'checking' end,
      attempts=item.attempts+1,claim_key=lease,claimed_at=now() where id=item.id;
    return query select item.id,e.id,d.id,d.expo_push_token,e.kind,e.recipient_group_id,e.invitation_id,e.conversation_id,
      item.ticket_id,lease,item.attempts+1,case when e.kind='favorite_trip' then e.source_id end
      from push_private.events e join public.push_devices d on d.id=item.device_id where e.id=item.event_id;
  end loop;
end;
$$;
revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

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
      jsonb_build_object('push_messages',true,'push_invitations',true,'push_favorite_trips',false,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end;
$$;
revoke all on function notifications_private.favorite_trip_published(),notifications_private.favorite_group_removed()
  from public,anon,authenticated;
notify pgrst,'reload schema';
