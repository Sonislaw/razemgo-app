-- Durable inbox is independent of device registration and push consent.
create schema if not exists notifications_private;
revoke all on schema notifications_private from public,anon,authenticated;
grant usage on schema notifications_private to authenticated,service_role;

create table public.notification_preferences (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  push_messages boolean not null default true,
  push_invitations boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  actor_group_id uuid not null references public.travel_groups(id) on delete cascade,
  kind text not null check(kind in('message','invitation_received','invitation_accepted','proposal')),
  source_id uuid not null,
  invitation_id uuid references public.contact_invitations(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  own_trip_id uuid references public.trip_plans(id) on delete set null,
  proposed_trip_id uuid references public.trip_plans(id) on delete set null,
  -- Preserve a deduplication key even after deleting the source trip.
  own_trip_reference uuid,
  trip_label text not null default '' check(length(trip_label)<=180),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check(recipient_group_id<>actor_group_id)
);
create unique index notification_source on public.notifications(recipient_group_id,kind,source_id,
  coalesce(own_trip_reference,'00000000-0000-0000-0000-000000000000'::uuid));
create index notification_history on public.notifications(recipient_group_id,created_at desc,id desc);
create index notification_unread on public.notifications(recipient_group_id) where read_at is null;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.notifications,public.notification_preferences from public,anon,authenticated;
grant select on public.notifications,public.notification_preferences to authenticated;
grant all on public.notifications,public.notification_preferences to service_role;

create function notifications_private.visible(recipient uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select recipient=messaging_private.my_group_id() and not messaging_private.pair_blocked(recipient,actor);
$$;
create policy own_notifications on public.notifications for select to authenticated
  using(notifications_private.visible(recipient_group_id,actor_group_id));
create policy own_notification_preferences on public.notification_preferences for select to authenticated
  using(group_id=(select messaging_private.my_group_id()));

-- Reuse the private per-crew Realtime invalidation counter, never publish inbox payloads.
create function notifications_private.changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if tg_table_name='notification_preferences' then recipient:=new.group_id;
  else recipient:=new.recipient_group_id; end if;
  insert into public.mailbox_updates(group_id) values(recipient)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return new;
end;
$$;
create trigger notification_changed after insert or update of read_at on public.notifications
  for each row execute function notifications_private.changed();
create trigger notification_preferences_changed after insert or update on public.notification_preferences
  for each row execute function notifications_private.changed();

create function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case when event_kind='message' then p.push_messages else p.push_invitations end
    from public.notification_preferences p where p.group_id=recipient),true);
$$;

create function public.save_my_notification_preference(preference_key text,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); saved public.notification_preferences;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if preference_key is null or preference_key not in('messages','invitations') or enabled is null
    then raise exception 'Invalid preference' using errcode='22023'; end if;
  -- Update one field atomically so another device cannot overwrite an unrelated setting.
  insert into public.notification_preferences(group_id,push_messages,push_invitations)
    values(me,case when preference_key='messages' then enabled else true end,
      case when preference_key='invitations' then enabled else true end)
    on conflict(group_id) do update set
      push_messages=case when preference_key='messages' then enabled else public.notification_preferences.push_messages end,
      push_invitations=case when preference_key='invitations' then enabled else public.notification_preferences.push_invitations end,
      updated_at=now() returning * into saved;
  if not enabled then
    -- Never revive an old queued alert when consent is enabled again. In-flight provider requests cannot be recalled.
    update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='PreferenceDisabled'
      from push_private.events e where e.id=d.event_id and e.recipient_group_id=me and d.ticket_id is null
      and d.status in('pending','sending') and (preference_key='messages' and e.kind='message'
        or preference_key='invitations' and e.kind in('invitation_received','invitation_accepted'));
  end if;
  return to_jsonb(saved)-'group_id';
end;
$$;

create or replace function push_private.enqueue(kind text,source_id uuid,recipient uuid,actor uuid,
  invitation uuid default null,conversation uuid default null,message uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare event uuid; label text;
begin
  if recipient=actor or messaging_private.pair_blocked(recipient,actor) then return; end if;
  select left(regexp_replace(i.trip_snapshot->>'description','\s+',' ','g'),180) into label
    from public.contact_invitations i where i.id=invitation;
  insert into public.notifications(kind,source_id,recipient_group_id,actor_group_id,invitation_id,conversation_id,message_id,trip_label)
    values(kind,source_id,recipient,actor,invitation,conversation,message,coalesce(label,''))
    on conflict do nothing returning id into event;
  if event is null then return; end if;
  if not notifications_private.push_allowed(recipient,kind)
    or not exists(select 1 from public.push_devices d where d.group_id=recipient) then return; end if;
  insert into push_private.events(id,kind,source_id,recipient_group_id,actor_group_id,invitation_id,conversation_id,message_id)
    values(event,kind,source_id,recipient,actor,invitation,conversation,message) on conflict do nothing;
  insert into push_private.deliveries(event_id,device_id)
    select event,d.id from public.push_devices d where d.group_id=recipient on conflict do nothing;
  begin perform push_private.wake_dispatcher(); exception when others then null; end;
end;
$$;

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
      ));
$$;

-- Chat receipts acknowledge inbox entries; acknowledging an inbox entry never changes chat receipts.
create function notifications_private.chat_read() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.last_read_sequence<=0 then return new; end if;
  update public.notifications n set read_at=now()
    where n.recipient_group_id=new.group_id and n.read_at is null and
      (n.conversation_id=new.conversation_id and (n.kind='invitation_accepted'
        or n.kind='message' and exists(select 1 from public.chat_messages m where m.id=n.message_id and m.sequence<=new.last_read_sequence)));
  return new;
end;
$$;
create trigger notification_chat_read after insert or update of last_read_sequence on public.conversation_reads
  for each row execute function notifications_private.chat_read();
create function notifications_private.invitation_resolved() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'pending' then update public.notifications set read_at=now()
    where invitation_id=new.id and kind='invitation_received' and read_at is null; end if;
  return new;
end;
$$;
create trigger notification_invitation_resolved after update of status on public.contact_invitations
  for each row execute function notifications_private.invitation_resolved();
create function notifications_private.blocked() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.notifications set read_at=now() where read_at is null and
    (recipient_group_id=new.blocker_group_id and actor_group_id=new.blocked_group_id
      or recipient_group_id=new.blocked_group_id and actor_group_id=new.blocker_group_id);
  return new;
end;
$$;
create trigger notification_pair_blocked after insert on public.group_blocks
  for each row execute function notifications_private.blocked();

create function notifications_private.normalized(value text) returns text
language sql immutable set search_path='' as $$
  select lower(translate(btrim(coalesce(value,'')),'ĄĆĘŁŃÓŚŹŻąćęłńóśźż','ACELNOSZZacelnoszz'));
$$;
-- Same criteria as discoveryFiltersForTrip: dates, region text, crew kind and OR age bands.
-- Refresh on foreground/inbox fetch; proposals are in-app notifications, not a new push category.
create function notifications_private.refresh_proposals(me uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,own_trip_id,own_trip_reference,proposed_trip_id,trip_label)
    select me,p.group_id,'proposal',p.id,o.id,o.id,p.id,left(regexp_replace(p.description,'\s+',' ','g'),180)
    from public.trip_plans o join public.trip_plans p on p.group_id<>o.group_id
    join public.travel_groups g on g.id=p.group_id
    where o.group_id=me and o.status='published' and o.visibility='public' and o.end_date>current_date
      and p.status='published' and p.visibility='public' and p.end_date>current_date
      and greatest(o.start_date,p.start_date)<least(o.end_date,p.end_date)
      and not messaging_private.pair_blocked(me,p.group_id)
      and (cardinality(o.matching_group_kinds)=0 or g.kind=any(o.matching_group_kinds))
      and (cardinality(o.matching_child_age_bands)=0 or g.child_age_bands && o.matching_child_age_bands)
      and position(notifications_private.normalized(coalesce(nullif(o.location_region,''),o.location_name))
        in notifications_private.normalized(p.location_name||', '||p.location_region||
          case when notifications_private.normalized(p.location_region) in('pomorze','pomorskie') then ' Pomorze Pomorskie' else '' end))>0
      and not exists(select 1 from public.notifications n where n.recipient_group_id=me and n.kind='proposal'
        and n.own_trip_reference=o.id and n.source_id=p.id)
    order by p.published_at desc,p.id,o.id limit 100 on conflict do nothing;
$$;

create function public.get_my_notifications(before_at timestamptz default null,before_id uuid default null,
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
      case when n.kind='proposal' then exists(select 1 from public.trip_plans p join public.trip_plans o on o.id=n.own_trip_id
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
      jsonb_build_object('push_messages',true,'push_invitations',true,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end;
$$;
create function public.mark_my_notifications_read(notification_ids uuid[] default null,read_through timestamptz default null) returns integer
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); changed integer;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if notification_ids is null and (read_through is null or read_through>now())
    or cardinality(notification_ids)>100 then raise exception 'Invalid read request' using errcode='22023'; end if;
  update public.notifications n set read_at=now() where n.recipient_group_id=me and n.read_at is null
    and not messaging_private.pair_blocked(me,n.actor_group_id)
    and (notification_ids is not null and n.id=any(notification_ids)
      or notification_ids is null and n.created_at<=read_through);
  get diagnostics changed=row_count;
  return changed;
end;
$$;

-- Preserve existing recent outbox events without generating push for historical entries.
insert into public.notifications(id,recipient_group_id,actor_group_id,kind,source_id,invitation_id,conversation_id,message_id,created_at,read_at,trip_label)
  select e.id,e.recipient_group_id,e.actor_group_id,e.kind,e.source_id,e.invitation_id,e.conversation_id,e.message_id,e.created_at,
    case when e.kind='message' and m.sequence<=coalesce(r.last_read_sequence,0)
      or e.kind='invitation_received' and i.status<>'pending'
      or e.kind='invitation_accepted' and coalesce(r.last_read_sequence,0)>0 then now() end,
    left(coalesce(i.trip_snapshot->>'description',''),180)
    from push_private.events e left join public.contact_invitations i on i.id=e.invitation_id
    left join public.chat_messages m on m.id=e.message_id
    left join public.conversation_reads r on r.conversation_id=e.conversation_id and r.group_id=e.recipient_group_id
    where not messaging_private.pair_blocked(e.recipient_group_id,e.actor_group_id) on conflict do nothing;
insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,invitation_id,created_at,trip_label)
  select i.recipient_group_id,i.sender_group_id,'invitation_received',i.id,i.id,i.created_at,
    left(coalesce(i.trip_snapshot->>'description',''),180) from public.contact_invitations i
    where i.status='pending' and not messaging_private.pair_blocked(i.recipient_group_id,i.sender_group_id) on conflict do nothing;
insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,invitation_id,conversation_id,message_id,created_at,trip_label)
  select case when m.sender_group_id=c.sender_group_id then c.recipient_group_id else c.sender_group_id end,
    m.sender_group_id,'message',m.id,c.invitation_id,c.id,m.id,m.created_at,left(coalesce(i.trip_snapshot->>'description',''),180)
    from public.chat_messages m join public.conversations c on c.id=m.conversation_id
    join public.contact_invitations i on i.id=c.invitation_id
    left join public.conversation_reads r on r.conversation_id=c.id
      and r.group_id=case when m.sender_group_id=c.sender_group_id then c.recipient_group_id else c.sender_group_id end
    where m.sequence>coalesce(r.last_read_sequence,0) and not messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id)
      and not(m.sender_group_id=i.sender_group_id and m.text=i.text
        and not exists(select 1 from public.chat_messages earlier where earlier.conversation_id=c.id and earlier.sequence<m.sequence))
    on conflict do nothing;

revoke all on all functions in schema notifications_private from public,anon,authenticated;
grant execute on function notifications_private.visible(uuid,uuid) to authenticated;
revoke all on function public.get_my_notifications(timestamptz,uuid,integer,boolean),
  public.mark_my_notifications_read(uuid[],timestamptz),public.save_my_notification_preference(text,boolean) from public,anon,authenticated;
grant execute on function public.get_my_notifications(timestamptz,uuid,integer,boolean),
  public.mark_my_notifications_read(uuid[],timestamptz),public.save_my_notification_preference(text,boolean) to authenticated;
notify pgrst,'reload schema';
