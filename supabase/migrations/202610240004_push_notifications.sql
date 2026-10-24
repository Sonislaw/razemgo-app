-- A server outbox is essential: delivery does not depend on an open app.
create schema if not exists push_private;
revoke all on schema push_private from public,anon,authenticated;
grant usage on schema push_private to service_role;

create table public.push_devices (
  id uuid primary key,
  installation_key_hash bytea not null,
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  expo_push_token text not null unique check(expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text not null check(platform in('android','ios')),
  project_id uuid not null check(project_id='b7305e7b-7e1c-4b12-9123-caa0587f49b0'::uuid),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from public,anon,authenticated;
grant all on public.push_devices to service_role;
create index push_devices_group on public.push_devices(group_id);

create table push_private.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in('invitation_received','invitation_accepted','message')),
  source_id uuid not null,
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  actor_group_id uuid not null references public.travel_groups(id) on delete cascade,
  invitation_id uuid references public.contact_invitations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  unique(kind,source_id,recipient_group_id)
);
create table push_private.deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references push_private.events(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  status text not null default 'pending' check(status in('pending','sending','ticketed','checking','sent','failed','skipped')),
  attempts integer not null default 0,
  ticket_id text,
  claim_key uuid,
  claimed_at timestamptz,
  due_at timestamptz not null default now(),
  error_code text,
  unique(event_id,device_id)
);
create index push_delivery_due on push_private.deliveries(due_at) where status in('pending','ticketed','sending','checking');
alter table push_private.events enable row level security;
alter table push_private.deliveries enable row level security;
revoke all on all tables in schema push_private from public,anon,authenticated;
grant all on all tables in schema push_private to service_role;

create function public.register_my_push_device(installation_id uuid,installation_key uuid,
  push_token text,device_platform text,expo_project_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); sid uuid;
  existing public.push_devices; key_hash bytea:=sha256(convert_to(installation_key::text,'UTF8'));
begin
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  if me is null or sid is null or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
    then raise exception 'Session required' using errcode='42501'; end if;
  if installation_id is null or installation_key is null then raise exception 'Installation required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(installation_id::text,1));
  select * into existing from public.push_devices d where d.id=installation_id for update;
  if found and existing.installation_key_hash<>key_hash then raise exception 'Invalid installation' using errcode='42501'; end if;
  -- Tokens never appear in a public profile or an API read response.
  if exists(select 1 from public.push_devices d where d.expo_push_token=push_token and d.id<>installation_id and d.group_id<>me)
    then raise exception 'Device already registered' using errcode='42501'; end if;
  delete from public.push_devices d where d.expo_push_token=push_token and d.id<>installation_id and d.group_id=me;
  insert into public.push_devices(id,installation_key_hash,group_id,session_id,expo_push_token,platform,project_id)
    values(installation_id,key_hash,me,sid,push_token,device_platform,expo_project_id)
    on conflict(id) do update set group_id=excluded.group_id,session_id=excluded.session_id,
      expo_push_token=excluded.expo_push_token,platform=excluded.platform,project_id=excluded.project_id,last_seen_at=now();
  -- An installation changing accounts must not carry queued notifications with it.
  delete from push_private.deliveries d using push_private.events e
    where d.device_id=installation_id and e.id=d.event_id and e.recipient_group_id<>me;
  return installation_id;
end;
$$;
create function public.unregister_my_push_device(installation_id uuid,installation_key uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.push_devices d where d.id=installation_id and d.group_id=messaging_private.my_group_id()
    and d.installation_key_hash=sha256(convert_to(installation_key::text,'UTF8'));
end;
$$;

-- Configured during deployment, after the Edge Function and Vault secret exist.
-- A no-op keeps local SQL tests independent of hosted extensions.
create function push_private.wake_dispatcher() returns void
language plpgsql security definer set search_path='' as $$ begin return; end; $$;

create function push_private.enqueue(kind text,source_id uuid,recipient uuid,actor uuid,
  invitation uuid default null,conversation uuid default null,message uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare event uuid;
begin
  if recipient=actor or messaging_private.pair_blocked(recipient,actor) then return; end if;
  -- Do not queue historic alerts for devices registered in the future.
  if not exists(select 1 from public.push_devices d where d.group_id=recipient) then return; end if;
  insert into push_private.events(kind,source_id,recipient_group_id,actor_group_id,invitation_id,conversation_id,message_id)
    values(kind,source_id,recipient,actor,invitation,conversation,message)
    on conflict on constraint events_kind_source_id_recipient_group_id_key do nothing returning id into event;
  if event is null then return; end if;
  insert into push_private.deliveries(event_id,device_id)
    select event,d.id from public.push_devices d where d.group_id=recipient;
  -- Dispatch infrastructure must never roll back a user's message/invitation.
  begin perform push_private.wake_dispatcher(); exception when others then null; end;
end;
$$;
create function push_private.invitation_inserted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='pending' then perform push_private.enqueue('invitation_received',new.id,new.recipient_group_id,new.sender_group_id,new.id); end if;
  return new;
end;
$$;
create function push_private.conversation_inserted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform push_private.enqueue('invitation_accepted',new.invitation_id,new.sender_group_id,new.recipient_group_id,new.invitation_id,new.id);
  return new;
end;
$$;
create function push_private.message_inserted() returns trigger
language plpgsql security definer set search_path='' as $$
declare chat public.conversations; invitation public.contact_invitations; recipient uuid;
begin
  select * into chat from public.conversations c where c.id=new.conversation_id;
  select * into invitation from public.contact_invitations i where i.id=chat.invitation_id;
  -- Acceptance copies the invitation into chat. It is not a new incoming message.
  if new.sender_group_id=invitation.sender_group_id and new.text=invitation.text
    and not exists(select 1 from public.chat_messages m where m.conversation_id=chat.id and m.id<>new.id) then return new; end if;
  recipient:=case when new.sender_group_id=chat.sender_group_id then chat.recipient_group_id else chat.sender_group_id end;
  perform push_private.enqueue('message',new.id,recipient,new.sender_group_id,chat.invitation_id,chat.id,new.id);
  return new;
end;
$$;
create trigger push_invitation_inserted after insert on public.contact_invitations for each row execute function push_private.invitation_inserted();
create trigger push_conversation_inserted after insert on public.conversations for each row execute function push_private.conversation_inserted();
create trigger push_message_inserted after insert on public.chat_messages for each row execute function push_private.message_inserted();

create function push_private.deliverable(delivery uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from push_private.deliveries x
    join push_private.events e on e.id=x.event_id join public.push_devices d on d.id=x.device_id
    join auth.sessions s on s.id=d.session_id
    where x.id=delivery and d.group_id=e.recipient_group_id and (s.not_after is null or s.not_after>now())
      and e.expires_at>now() and not messaging_private.pair_blocked(e.recipient_group_id,e.actor_group_id)
      and (
        e.kind='invitation_received' and exists(select 1 from public.contact_invitations i where i.id=e.invitation_id and i.status='pending')
        or e.kind='invitation_accepted' and exists(select 1 from public.conversations c where c.id=e.conversation_id)
        or e.kind='message' and exists(select 1 from public.chat_messages m where m.id=e.message_id and m.sequence>
          coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=e.conversation_id and r.group_id=e.recipient_group_id),0))
      ));
$$;

create function public.claim_push_deliveries(batch_size integer default 30)
returns table(delivery_id uuid,event_id uuid,device_id uuid,push_token text,kind text,recipient_group_id uuid,
  invitation_id uuid,conversation_id uuid,ticket_id text,claim_key uuid,attempts integer)
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
      item.ticket_id,lease,item.attempts+1 from push_private.events e join public.push_devices d on d.id=item.device_id where e.id=item.event_id;
  end loop;
end;
$$;

create function public.finish_push_delivery(delivery_id uuid,lease uuid,result text,
  expected_token text,expo_ticket_id text default null,failure_code text default null) returns void
language plpgsql security definer set search_path='' as $$
declare item push_private.deliveries;
begin
  select * into item from push_private.deliveries d where d.id=delivery_id and d.claim_key=lease and d.status in('sending','checking') for update;
  if not found then return; end if;
  if result not in('ticket','sent','retry','invalid','failed') then raise exception 'Invalid result' using errcode='22023'; end if;
  if result='invalid' then
    delete from public.push_devices d where d.id=item.device_id and d.expo_push_token=expected_token;
  end if;
  update push_private.deliveries set
    status=case when result='ticket' then 'ticketed' when result='retry' and item.attempts<8 then
      case when item.ticket_id is null then 'pending' else 'ticketed' end
      when result='sent' then 'sent' else 'failed' end,
    ticket_id=case when result='ticket' then expo_ticket_id else item.ticket_id end,
    due_at=now()+case when result='ticket' then interval '15 minutes'
      when item.ticket_id is not null then interval '5 minutes' else least(3600,30*power(2,item.attempts)::integer)*interval '1 second' end,
    claim_key=null,claimed_at=null,error_code=left(failure_code,80)
    where id=item.id;
end;
$$;

revoke all on all functions in schema push_private from public,anon,authenticated;
revoke all on function public.register_my_push_device(uuid,uuid,text,text,uuid),public.unregister_my_push_device(uuid,uuid),
  public.claim_push_deliveries(integer),public.finish_push_delivery(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_my_push_device(uuid,uuid,text,text,uuid),public.unregister_my_push_device(uuid,uuid) to authenticated;
grant execute on function public.claim_push_deliveries(integer),public.finish_push_delivery(uuid,uuid,text,text,text,text) to service_role;
notify pgrst,'reload schema';
