-- Foreground presence is transient and separate from the public profile.
-- Raw connections, session identifiers and timestamps are never exposed by REST.
create schema presence_private;
revoke all on schema presence_private from public, anon, authenticated;
create table presence_private.connections (
  session_id uuid not null references auth.sessions(id) on delete cascade,
  connection_id uuid not null,
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  online boolean not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, connection_id)
);
create index presence_group_online on presence_private.connections(group_id, updated_at) where online;
create index presence_cleanup on presence_private.connections(updated_at);
alter table presence_private.connections enable row level security;
revoke all on presence_private.connections from public, anon, authenticated;

create function public.set_my_presence(connection_id uuid, is_online boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := messaging_private.my_group_id();
  sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if me is null or sid is null or not exists (
    select 1 from auth.sessions s where s.id = sid and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Active account and session required' using errcode = '42501'; end if;
  if connection_id is null or is_online is null then
    raise exception 'Invalid presence' using errcode = '22023';
  end if;
  insert into presence_private.connections as c(session_id, connection_id, group_id, online, updated_at)
    values(sid, connection_id, me, is_online, now())
    on conflict on constraint connections_pkey do update
    -- A closed connection cannot be revived by a delayed heartbeat. Foregrounding
    -- creates a new random connection ID, also allowing independent browser tabs.
    set online = c.online and excluded.online, updated_at = now();
  -- Bounded maintenance; no activity history is retained for inactive connections.
  delete from presence_private.connections c where (c.session_id, c.connection_id) in (
    select old.session_id, old.connection_id from presence_private.connections old
      where old.updated_at < now() - interval '1 day' order by old.updated_at limit 100
  );
end $$;

create function public.get_online_groups(group_ids uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); result uuid[];
begin
  if me is null or not exists (
    select 1 from auth.sessions s where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      and s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Active profile and session required' using errcode = '42501'; end if;
  if group_ids is null or cardinality(group_ids) > 100 or array_position(group_ids, null) is not null then
    raise exception 'Invalid group IDs' using errcode = '22023';
  end if;
  select coalesce(array_agg(g.id), '{}'::uuid[]) into result from public.travel_groups g
  where g.id = any(group_ids)
    and not messaging_private.pair_blocked(me, g.id)
    and (g.id = me or exists (
      select 1 from public.group_public_profiles p where p.group_id = g.id and p.discoverable
    ) or messaging_private.public_trip_count(g.id) > 0 or exists (
      select 1 from public.contact_invitations i where i.status in ('pending', 'accepted') and (
        (i.sender_group_id = me and i.recipient_group_id = g.id)
        or (i.sender_group_id = g.id and i.recipient_group_id = me)
      )
    ))
    and exists (
      select 1 from presence_private.connections c join auth.sessions s on s.id = c.session_id
      where c.group_id = g.id and c.online and c.updated_at > now() - interval '75 seconds'
        and s.user_id = g.owner_user_id and (s.not_after is null or s.not_after > now())
    );
  return result;
end $$;
revoke all on function public.set_my_presence(uuid, boolean), public.get_online_groups(uuid[]) from public, anon;
grant execute on function public.set_my_presence(uuid, boolean), public.get_online_groups(uuid[]) to authenticated;
notify pgrst, 'reload schema';
