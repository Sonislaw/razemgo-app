-- Contact is established by an accepted invitation. Clients never write these
-- tables directly: RPCs derive the actor from auth.uid() and serialize each pair.
create schema if not exists messaging_private;
revoke all on schema messaging_private from public, anon;
grant usage on schema messaging_private to authenticated;

create table public.contact_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_group_id uuid not null references public.travel_groups(id) on delete cascade,
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  trip_id uuid references public.trip_plans(id) on delete set null,
  source_trip_id uuid references public.trip_plans(id) on delete set null,
  trip_reference uuid not null,
  trip_snapshot jsonb not null,
  source_trip_snapshot jsonb,
  text text not null check (length(btrim(text)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  request_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_group_id <> recipient_group_id),
  unique (sender_group_id, request_key)
);
create unique index contact_invitation_open on public.contact_invitations(sender_group_id, recipient_group_id, trip_reference)
  where status in ('pending','accepted');
create index contact_invitation_recipient on public.contact_invitations(recipient_group_id, created_at desc);
create index contact_invitation_sender on public.contact_invitations(sender_group_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.contact_invitations(id) on delete cascade,
  sender_group_id uuid not null references public.travel_groups(id) on delete cascade,
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_group_id <> recipient_group_id)
);
create index conversation_sender on public.conversations(sender_group_id);
create index conversation_recipient on public.conversations(recipient_group_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_group_id uuid not null references public.travel_groups(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  request_key uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_group_id, request_key)
);
create index chat_message_history on public.chat_messages(conversation_id, sequence desc);
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, group_id)
);
create table public.group_blocks (
  blocker_group_id uuid not null references public.travel_groups(id) on delete cascade,
  blocked_group_id uuid not null references public.travel_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_group_id, blocked_group_id),
  check (blocker_group_id <> blocked_group_id)
);
create index group_blocks_target on public.group_blocks(blocked_group_id);
create table public.account_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_group_id uuid references public.travel_groups(id) on delete set null,
  reported_group_id uuid references public.travel_groups(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null check (reason in ('Spam','Niewłaściwe treści','Podszywanie się','Inny powód')),
  request_key uuid not null,
  -- Evidence is server-only; reporters receive a confirmation, not an editable report.
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  unique (reporter_group_id, request_key)
);
-- Realtime carries only an invalidation counter for the current crew. Private
-- messages, block lists and read receipts are not placed in the publication.
create table public.mailbox_updates (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  revision bigint not null default 1
);

create function messaging_private.my_group_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.travel_groups where owner_user_id = (select auth.uid());
$$;
create function messaging_private.participates(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = target
    and messaging_private.my_group_id() in (c.sender_group_id, c.recipient_group_id));
$$;
create function messaging_private.pair_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_blocks x
    where (x.blocker_group_id = a and x.blocked_group_id = b)
       or (x.blocker_group_id = b and x.blocked_group_id = a));
$$;
create function messaging_private.lock_pair(a uuid, b uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text || ':' || greatest(a,b)::text, 0));
$$;
create function messaging_private.touch_pair(a uuid, b uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.mailbox_updates(group_id) select id from public.travel_groups where id in(a,b)
  on conflict(group_id) do update set revision = public.mailbox_updates.revision + 1;
$$;
create function messaging_private.group_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mailbox_updates(group_id)
    select distinct case when i.sender_group_id=old.id then i.recipient_group_id else i.sender_group_id end
    from public.contact_invitations i where old.id in(i.sender_group_id,i.recipient_group_id)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return old;
end;
$$;
create trigger messaging_group_removed before delete on public.travel_groups
  for each row execute function messaging_private.group_removed();
create function messaging_private.trip_snapshot(t public.trip_plans) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'group_id', t.group_id, 'mode', t.mode,
    'description', t.description, 'start_date', t.start_date, 'end_date', t.end_date,
    'location_name', t.location_name, 'location_region', t.location_region,
    'campground_name', t.campground_name, 'landscape', t.landscape);
$$;

alter table public.contact_invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.group_blocks enable row level security;
alter table public.account_reports enable row level security;
alter table public.mailbox_updates enable row level security;
revoke all on public.contact_invitations, public.conversations, public.chat_messages,
  public.conversation_reads, public.group_blocks, public.account_reports, public.mailbox_updates from public, anon, authenticated;
grant select on public.contact_invitations, public.conversations, public.chat_messages,
  public.conversation_reads, public.group_blocks, public.mailbox_updates to authenticated;
create policy invitation_participants on public.contact_invitations for select to authenticated
  using ((select messaging_private.my_group_id()) in (sender_group_id, recipient_group_id));
create policy conversation_participants on public.conversations for select to authenticated
  using ((select messaging_private.my_group_id()) in (sender_group_id, recipient_group_id));
create policy message_participants on public.chat_messages for select to authenticated
  using (messaging_private.participates(conversation_id));
create policy receipt_participants on public.conversation_reads for select to authenticated
  using (messaging_private.participates(conversation_id));
create policy own_blocks on public.group_blocks for select to authenticated
  using (blocker_group_id = (select messaging_private.my_group_id()));
create policy own_mailbox_updates on public.mailbox_updates for select to authenticated
  using (group_id = (select messaging_private.my_group_id()));
-- Reports are intentionally accessible only to server-side moderation tools.

create function public.send_contact_invitation(target_trip_id uuid, message_text text,
  request_key uuid, source_trip_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); target public.trip_plans;
  source public.trip_plans; existing public.contact_invitations; saved uuid;
begin
  if me is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if request_key is null or length(btrim(coalesce(message_text,''))) not between 1 and 500
    then raise exception 'Invalid invitation' using errcode = '22023'; end if;
  select * into existing from public.contact_invitations i
    where i.sender_group_id = me and i.request_key = send_contact_invitation.request_key;
  if found then
    if existing.trip_reference <> target_trip_id then raise exception 'Request key reused' using errcode='22023'; end if;
    return existing.id;
  end if;
  select * into target from public.trip_plans t where t.id = target_trip_id;
  if not found or target.group_id = me then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  perform messaging_private.lock_pair(me, target.group_id);
  -- Recheck after taking the pair lock (including simultaneous retries).
  select * into existing from public.contact_invitations i where i.sender_group_id = me
    and (i.request_key = send_contact_invitation.request_key or
      (i.trip_reference = target_trip_id and i.status in ('pending','accepted')));
  if found then
    if existing.trip_reference <> target_trip_id then raise exception 'Request key reused' using errcode='22023'; end if;
    return existing.id;
  end if;
  if messaging_private.pair_blocked(me, target.group_id)
    then raise exception 'Contact blocked' using errcode = '42501'; end if;
  select * into target from public.trip_plans t where t.id = target_trip_id for share;
  if not found or target.status <> 'published' or target.visibility <> 'public' or target.end_date <= current_date
    then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  if source_trip_id is not null then
    select * into source from public.trip_plans t where t.id = source_trip_id and t.group_id = me for share;
    if not found or source.status <> 'published' or source.visibility <> 'public' or source.end_date <= current_date
      then raise exception 'Source trip unavailable' using errcode = 'P0002'; end if;
  end if;
  if (select count(*) from public.contact_invitations i where i.sender_group_id = me
      and i.recipient_group_id = target.group_id and i.created_at > now() - interval '1 hour') >= 5
    then raise exception 'Invitation limit reached' using errcode = '54000'; end if;
  insert into public.contact_invitations(sender_group_id, recipient_group_id, trip_id, source_trip_id,
    trip_reference, trip_snapshot, source_trip_snapshot, text, request_key)
  values (me, target.group_id, target.id, source.id, target.id, messaging_private.trip_snapshot(target),
    case when source.id is not null then messaging_private.trip_snapshot(source) end,
    btrim(message_text), request_key) returning id into saved;
  perform messaging_private.touch_pair(me,target.group_id);
  return saved;
end;
$$;

create function public.respond_contact_invitation(invitation_id uuid, response text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); invitation public.contact_invitations; chat_id uuid;
begin
  if me is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into invitation from public.contact_invitations i where i.id = invitation_id
    and me in (i.sender_group_id,i.recipient_group_id);
  if not found then raise exception 'Invitation unavailable' using errcode='P0002'; end if;
  perform messaging_private.lock_pair(invitation.sender_group_id, invitation.recipient_group_id);
  select * into invitation from public.contact_invitations i where i.id = invitation_id for update;
  if not (response in ('accepted','declined') and me = invitation.recipient_group_id
    or response = 'withdrawn' and me = invitation.sender_group_id)
    then raise exception 'Not permitted' using errcode = '42501'; end if;
  if invitation.status = response then
    select id into chat_id from public.conversations c where c.invitation_id = invitation.id;
    return chat_id;
  end if;
  if invitation.status <> 'pending' then raise exception 'Invitation closed' using errcode = '22023'; end if;
  if response = 'accepted' and messaging_private.pair_blocked(invitation.sender_group_id, invitation.recipient_group_id)
    then raise exception 'Contact blocked' using errcode = '42501'; end if;
  update public.contact_invitations set status = response, updated_at = now() where id = invitation.id;
  if response = 'accepted' then
    insert into public.conversations(invitation_id,sender_group_id,recipient_group_id)
      values(invitation.id,invitation.sender_group_id,invitation.recipient_group_id) returning id into chat_id;
    insert into public.conversation_reads(conversation_id,group_id)
      values(chat_id,invitation.sender_group_id),(chat_id,invitation.recipient_group_id);
    insert into public.chat_messages(conversation_id,sender_group_id,text,request_key)
      values(chat_id,invitation.sender_group_id,invitation.text,gen_random_uuid());
  end if;
  perform messaging_private.touch_pair(invitation.sender_group_id,invitation.recipient_group_id);
  return chat_id;
end;
$$;

create function public.send_chat_message(conversation_id uuid, message_text text, request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); chat public.conversations; saved public.chat_messages;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if request_key is null or length(btrim(coalesce(message_text,''))) not between 1 and 2000
    then raise exception 'Invalid message' using errcode='22023'; end if;
  select * into chat from public.conversations c where c.id = conversation_id
    and me in (c.sender_group_id,c.recipient_group_id);
  if not found then raise exception 'Conversation unavailable' using errcode='P0002'; end if;
  perform messaging_private.lock_pair(chat.sender_group_id,chat.recipient_group_id);
  select * into saved from public.chat_messages m where m.sender_group_id = me
    and m.request_key = send_chat_message.request_key;
  if found then
    if saved.conversation_id <> conversation_id then raise exception 'Request key reused' using errcode='22023'; end if;
    return to_jsonb(saved);
  end if;
  if messaging_private.pair_blocked(chat.sender_group_id,chat.recipient_group_id)
    then raise exception 'Contact blocked' using errcode='42501'; end if;
  insert into public.chat_messages(conversation_id,sender_group_id,text,request_key)
    values(chat.id,me,btrim(message_text),request_key) returning * into saved;
  update public.conversations set updated_at = now() where id = chat.id;
  perform messaging_private.touch_pair(chat.sender_group_id,chat.recipient_group_id);
  return to_jsonb(saved);
end;
$$;

create function public.mark_conversation_read(conversation_id uuid, through_message_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); through_sequence bigint; saved bigint;
begin
  if me is null or not messaging_private.participates(conversation_id)
    then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  select m.sequence into through_sequence from public.chat_messages m
    where m.id = through_message_id and m.conversation_id = mark_conversation_read.conversation_id;
  if not found then raise exception 'Message unavailable' using errcode='P0002'; end if;
  select r.last_read_sequence into saved from public.conversation_reads r
    where r.conversation_id=mark_conversation_read.conversation_id and r.group_id=me;
  if coalesce(saved,0)>=through_sequence then return saved; end if;
  insert into public.conversation_reads(conversation_id,group_id,last_read_sequence)
    values(conversation_id,me,through_sequence)
    on conflict on constraint conversation_reads_pkey do update
      set last_read_sequence = greatest(public.conversation_reads.last_read_sequence,excluded.last_read_sequence), updated_at=now()
    returning last_read_sequence into saved;
  perform messaging_private.touch_pair(c.sender_group_id,c.recipient_group_id)
    from public.conversations c where c.id=mark_conversation_read.conversation_id;
  return saved;
end;
$$;

create function public.get_conversation_messages(conversation_id uuid, before_sequence bigint default null, page_size integer default 50)
returns setof public.chat_messages language plpgsql stable security definer set search_path = '' as $$
begin
  if not messaging_private.participates(conversation_id)
    then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  return query select m.* from public.chat_messages m where m.conversation_id = get_conversation_messages.conversation_id
    and (before_sequence is null or m.sequence < before_sequence)
    order by m.sequence desc limit greatest(1,least(coalesce(page_size,50),100));
end;
$$;

create function public.set_group_block(target_group_id uuid, blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id();
begin
  if me is null or target_group_id = me then raise exception 'Not permitted' using errcode='42501'; end if;
  perform messaging_private.lock_pair(me,target_group_id);
  -- A known invitation/contact is required; arbitrary account IDs cannot be probed.
  if not exists (select 1 from public.contact_invitations i where
      (i.sender_group_id = me and i.recipient_group_id = target_group_id)
      or (i.sender_group_id = target_group_id and i.recipient_group_id = me))
    then raise exception 'Contact unavailable' using errcode='P0002'; end if;
  if blocked then
    insert into public.group_blocks(blocker_group_id,blocked_group_id) values(me,target_group_id) on conflict do nothing;
    update public.contact_invitations i set status='declined',updated_at=now()
      where i.status='pending' and ((i.sender_group_id=me and i.recipient_group_id=target_group_id)
        or (i.sender_group_id=target_group_id and i.recipient_group_id=me));
  else
    delete from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=target_group_id;
  end if;
  perform messaging_private.touch_pair(me,target_group_id);
end;
$$;

create function public.report_conversation(conversation_id uuid, report_reason text, request_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); chat public.conversations; saved uuid;
begin
  select * into chat from public.conversations c where c.id=conversation_id
    and me in (c.sender_group_id,c.recipient_group_id);
  if me is null or not found then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023'; end if;
  insert into public.account_reports(reporter_group_id,reported_group_id,conversation_id,reason,request_key,evidence)
    values(me,case when me=chat.sender_group_id then chat.recipient_group_id else chat.sender_group_id end,
      chat.id,report_reason,request_key,
      jsonb_build_object('invitation_id',chat.invitation_id,'messages',coalesce((select jsonb_agg(e) from
        (select m.id,m.sender_group_id,m.text,m.created_at from public.chat_messages m
          where m.conversation_id=chat.id order by m.sequence desc limit 20) e),'[]'::jsonb)))
    on conflict on constraint account_reports_reporter_group_id_request_key_key do update set request_key=excluded.request_key
    returning id into saved;
  return saved;
end;
$$;

create function public.get_my_mailbox() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); result jsonb;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'invitations',coalesce((select jsonb_agg(to_jsonb(i) - 'request_key' order by i.created_at desc,i.id)
      from public.contact_invitations i where me in (i.sender_group_id,i.recipient_group_id)),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'invitation_id',c.invitation_id,'sender_group_id',c.sender_group_id,'recipient_group_id',c.recipient_group_id,
      'updated_at',c.updated_at,'blocked',messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id),
      'self_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0),
      'other_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id<>me),0),
      'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_group_id<>me and
        m.sequence > coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0)),
      'last_message',(select to_jsonb(m) from public.chat_messages m where m.conversation_id=c.id order by m.sequence desc limit 1)
    ) order by c.updated_at desc,c.id) from public.conversations c where me in(c.sender_group_id,c.recipient_group_id)),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'avatar_id',g.avatar_id,'adult_count',g.adult_count))
      from public.travel_groups g where g.id<>me and exists(select 1 from public.contact_invitations i
        where (i.sender_group_id=me and i.recipient_group_id=g.id) or (i.recipient_group_id=me and i.sender_group_id=g.id))),'[]'::jsonb),
    'blocked_group_ids',coalesce((select jsonb_agg(b.blocked_group_id) from public.group_blocks b where b.blocker_group_id=me),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'group_id',r.reported_group_id,'conversation_id',r.conversation_id,'reason',r.reason))
      from public.account_reports r where r.reporter_group_id=me),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Explicit revocation also covers projects with hosted Supabase default grants.
revoke all on all functions in schema messaging_private from public, anon, authenticated;
grant execute on function messaging_private.my_group_id(),messaging_private.participates(uuid) to authenticated;
revoke all on function public.send_contact_invitation(uuid,text,uuid,uuid), public.respond_contact_invitation(uuid,text),
  public.send_chat_message(uuid,text,uuid),public.mark_conversation_read(uuid,uuid),
  public.get_conversation_messages(uuid,bigint,integer),public.set_group_block(uuid,boolean),
  public.report_conversation(uuid,text,uuid),public.get_my_mailbox() from public,anon,authenticated;
grant execute on function public.send_contact_invitation(uuid,text,uuid,uuid), public.respond_contact_invitation(uuid,text),
  public.send_chat_message(uuid,text,uuid),public.mark_conversation_read(uuid,uuid),
  public.get_conversation_messages(uuid,bigint,integer),public.set_group_block(uuid,boolean),
  public.report_conversation(uuid,text,uuid),public.get_my_mailbox() to authenticated;

-- Local SQL tests do not have a Realtime publication. Hosted Supabase does.
do $$ declare item text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach item in array array['mailbox_updates'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then
        execute format('alter publication supabase_realtime add table public.%I',item);
      end if;
    end loop;
  end if;
end $$;
notify pgrst, 'reload schema';

-- Keep discovery and direct detail lookup consistent with bilateral blocking.
create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb, crew jsonb)
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'group_id', t.group_id, 'mode', t.mode, 'status', t.status, 'visibility', t.visibility,
    'start_date', t.start_date, 'end_date', t.end_date,
    'location_id', t.location_id, 'location_name', t.location_name, 'location_region', t.location_region,
    'location_kind', t.location_kind, 'campground_name', t.campground_name, 'campground_address', t.campground_address,
    'travel_mode', t.travel_mode, 'description', t.description, 'landscape', t.landscape,
    'interests', t.interests, 'animal_kinds', t.animal_kinds,
    'matching_group_kinds', t.matching_group_kinds, 'matching_child_age_bands', t.matching_child_age_bands,
    'published_at', t.published_at
  ), jsonb_build_object(
    'id', g.id, 'name', g.name, 'avatar_id', g.avatar_id, 'kind', g.kind,
    'adult_count', g.adult_count, 'child_count', g.child_count, 'child_age_bands', g.child_age_bands,
    'travel_mode', g.travel_mode, 'interests', g.interests, 'animal_kinds', g.animal_kinds
  )
  from public.trip_plans t join public.travel_groups g on g.id = t.group_id
  where auth.uid() is not null
    and exists (select 1 from public.travel_groups me where me.owner_user_id = auth.uid())
    and g.owner_user_id <> auth.uid()
    and not messaging_private.pair_blocked(messaging_private.my_group_id(), g.id)
    and t.status = 'published' and t.visibility = 'public' and t.end_date > current_date
    and (requested_trip_id is null or t.id = requested_trip_id)
  order by t.published_at desc, t.id;
$$;
