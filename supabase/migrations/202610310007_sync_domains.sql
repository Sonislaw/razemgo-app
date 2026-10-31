-- Per-account invalidation only; no payloads or global write hotspot.
create table messaging_private.sync_revisions (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  mailbox bigint not null default 0, notifications bigint not null default 0,
  favorites bigint not null default 0, trips bigint not null default 0
);
alter table messaging_private.sync_revisions enable row level security;
revoke all on messaging_private.sync_revisions from public,anon,authenticated;

create or replace function messaging_private.touch_pair(a uuid, b uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into messaging_private.sync_revisions(group_id,mailbox)
    select id,1 from public.travel_groups where id in(a,b)
    on conflict(group_id) do update set mailbox=messaging_private.sync_revisions.mailbox+1;
  insert into public.mailbox_updates(group_id) select id from public.travel_groups where id in(a,b)
  on conflict(group_id) do update set revision = public.mailbox_updates.revision + 1;
$$;

create or replace function notifications_private.changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if tg_table_name='notification_preferences' then recipient:=new.group_id;
  else recipient:=new.recipient_group_id; end if;
  insert into messaging_private.sync_revisions(group_id,notifications) values(recipient,1)
    on conflict(group_id) do update set notifications=messaging_private.sync_revisions.notifications+1;
  insert into public.mailbox_updates(group_id) values(recipient)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return new;
end;
$$;

create or replace function messaging_private.group_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into messaging_private.sync_revisions(group_id,mailbox)
    select distinct case when i.sender_group_id=old.id then i.recipient_group_id else i.sender_group_id end,1
    from public.contact_invitations i where old.id in(i.sender_group_id,i.recipient_group_id)
    on conflict(group_id) do update set mailbox=messaging_private.sync_revisions.mailbox+1;
  insert into public.mailbox_updates(group_id)
    select distinct case when i.sender_group_id=old.id then i.recipient_group_id else i.sender_group_id end
    from public.contact_invitations i where old.id in(i.sender_group_id,i.recipient_group_id)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return old;
end;
$$;

create function messaging_private.collection_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if tg_table_name='trip_plans' then
    recipient:=case when tg_op='DELETE' then old.group_id else new.group_id end;
  else recipient:=case when tg_op='DELETE' then old.owner_group_id else new.owner_group_id end; end if;
  -- Cascading account deletion must not recreate an orphan revision row.
  if not exists(select 1 from public.travel_groups where id=recipient) then return null; end if;
  insert into messaging_private.sync_revisions(group_id,trips,favorites)
    values(recipient,case when tg_table_name='trip_plans' then 1 else 0 end,
      case when tg_table_name='trip_plans' then 0 else 1 end)
    on conflict(group_id) do update set trips=messaging_private.sync_revisions.trips+excluded.trips,
      favorites=messaging_private.sync_revisions.favorites+excluded.favorites;
  insert into public.mailbox_updates(group_id) values(recipient)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return null;
end $$;
revoke all on function messaging_private.collection_changed() from public,anon,authenticated;
create trigger sync_trip_collection after insert or update or delete on public.trip_plans
  for each row execute function messaging_private.collection_changed();
create trigger sync_group_favorites after insert or delete on favorites_private.group_favorites
  for each row execute function messaging_private.collection_changed();
create trigger sync_trip_favorites after insert or delete on favorites_private.trip_favorites
  for each row execute function messaging_private.collection_changed();

create or replace function public.get_my_sync_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  select jsonb_build_object(
    'domains',coalesce((select jsonb_build_object('mailbox',s.mailbox::text,'notifications',s.notifications::text,
      'favorites',s.favorites::text,'trips',s.trips::text) from messaging_private.sync_revisions s where s.group_id=me),
      '{"mailbox":"0","notifications":"0","favorites":"0","trips":"0"}'::jsonb),
    'revision',coalesce((select revision from public.mailbox_updates where group_id=me),0),
    'unread_messages',coalesce((select count(*) from public.chat_messages m join public.conversations c on c.id=m.conversation_id
      left join public.conversation_reads r on r.conversation_id=c.id and r.group_id=me
      where me in(c.sender_group_id,c.recipient_group_id) and m.sender_group_id<>me and m.sequence>coalesce(r.last_read_sequence,0)
        and not messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id)),0),
    'pending_invitations',(select count(*) from public.contact_invitations i where i.recipient_group_id=me and i.status='pending'
      and not messaging_private.pair_blocked(me,i.sender_group_id)),
    'unread_notifications',(select count(*) from public.notifications n where n.recipient_group_id=me and n.read_at is null
      and not messaging_private.pair_blocked(me,n.actor_group_id)),
    'active_trips',(select count(*) from public.trip_plans t where t.group_id=me and not(t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=current_date)),
    'archived_trips',(select count(*) from public.trip_plans t where t.group_id=me and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=current_date))
  ) into result;
  return result;
end $$;
notify pgrst,'reload schema';
