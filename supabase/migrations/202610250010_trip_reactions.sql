-- A nullable kind is a withdrawn reaction. Keep its identity to prevent repeat alerts.
create schema reactions_private;
revoke all on schema reactions_private from public,anon,authenticated;
create table reactions_private.trip_reactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip_plans(id) on delete cascade,
  actor_group_id uuid not null references public.travel_groups(id) on delete cascade,
  kind text check(kind in('love','envy','curious','adventure','applause')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trip_id,actor_group_id)
);
create index reaction_actor_updates on reactions_private.trip_reactions(actor_group_id,updated_at);
alter table reactions_private.trip_reactions enable row level security;
revoke all on reactions_private.trip_reactions from public,anon,authenticated;

create function reactions_private.can_read(me uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trip_plans t where t.id=target and t.group_id=me)
    or favorites_private.can_view_trip(me,target);
$$;
create function reactions_private.summary(me uuid,target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('trip_id',target,'available',reactions_private.can_read(me,target),
    'can_react',favorites_private.can_view_trip(me,target),
    'counts',coalesce((select jsonb_object_agg(c.kind,c.amount) from (
      select r.kind,count(*)::integer amount from reactions_private.trip_reactions r
      join public.trip_plans t on t.id=r.trip_id where r.trip_id=target and r.kind is not null
        and reactions_private.can_read(me,target)
        and not messaging_private.pair_blocked(t.group_id,r.actor_group_id)
        and not messaging_private.pair_blocked(me,r.actor_group_id)
      group by r.kind) c),'{}'::jsonb),
    'mine',(select r.kind from reactions_private.trip_reactions r where r.trip_id=target and r.actor_group_id=me
      and reactions_private.can_read(me,target)));
$$;
create function public.get_trip_reactions(trip_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if trip_ids is null or cardinality(trip_ids)>100 or array_position(trip_ids,null) is not null
    then raise exception 'Invalid trip ids' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(reactions_private.summary(me,t.id)) from (select distinct unnest(trip_ids) id) t),'[]'::jsonb);
end $$;

alter table public.notification_preferences add column push_reactions boolean not null default true;
alter table public.notifications add column reaction_kind text check(reaction_kind in('love','envy','curious','adventure','applause'));
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check(kind in('message','invitation_received','invitation_accepted','proposal','favorite_trip','trip_reaction'));
alter table push_private.events drop constraint events_kind_check;
alter table push_private.events add constraint events_kind_check
  check(kind in('invitation_received','invitation_accepted','message','favorite_trip','trip_reaction'));

create or replace function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case event_kind when 'message' then p.push_messages
    when 'favorite_trip' then p.push_favorite_trips when 'trip_reaction' then p.push_reactions
    when 'invitation_received' then p.push_invitations when 'invitation_accepted' then p.push_invitations
    else false end from public.notification_preferences p where p.group_id=recipient),
    event_kind in('message','invitation_received','invitation_accepted','favorite_trip','trip_reaction'));
$$;

-- Called only by the validated write RPC; notification, preference and queue are atomic.
create function reactions_private.notify(saved reactions_private.trip_reactions,owner_id uuid,description text) returns void
language plpgsql security definer set search_path='' as $$
declare notification_id uuid; queued integer;
begin
  if saved.kind is not null then
    insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,proposed_trip_id,trip_label,reaction_kind)
      values(owner_id,saved.actor_group_id,'trip_reaction',saved.id,saved.trip_id,
        left(regexp_replace(description,'\s+',' ','g'),180),saved.kind)
      on conflict do nothing returning id into notification_id;
  end if;
  if notification_id is null then
    update public.notifications n set reaction_kind=coalesce(saved.kind,n.reaction_kind),
      read_at=case when saved.kind is null then coalesce(n.read_at,now()) else n.read_at end
      where n.kind='trip_reaction' and n.source_id=saved.id;
    if saved.kind is null then
      update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='ReactionRemoved'
        from push_private.events e where e.id=d.event_id and e.kind='trip_reaction' and e.source_id=saved.id
          and d.ticket_id is null and d.status in('pending','sending');
    end if;
    return;
  end if;
  if notifications_private.push_allowed(owner_id,'trip_reaction') then
    with events as (
      insert into push_private.events(id,kind,source_id,recipient_group_id,actor_group_id)
        select notification_id,'trip_reaction',saved.id,owner_id,saved.actor_group_id
        where exists(select 1 from public.push_devices d where d.group_id=owner_id)
        on conflict do nothing returning id
    ) insert into push_private.deliveries(event_id,device_id)
      select e.id,d.id from events e join public.push_devices d on d.group_id=owner_id on conflict do nothing;
    get diagnostics queued=row_count;
    if queued>0 then begin perform push_private.wake_dispatcher(); exception when others then null; end; end if;
  end if;
end $$;

create function public.set_my_trip_reaction(target_trip_id uuid,reaction_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); target public.trip_plans; saved reactions_private.trip_reactions;
begin
  if target_trip_id is null or (reaction_kind is not null and reaction_kind not in('love','envy','curious','adventure','applause'))
    then raise exception 'Invalid reaction' using errcode='22023'; end if;
  -- Serialize this account's writes across devices and retries, without trusting client identity/counts.
  perform pg_advisory_xact_lock(hashtextextended('reactions:'||me::text,0));
  select * into target from public.trip_plans t where t.id=target_trip_id for share;
  if not found or target.group_id=me or not favorites_private.can_view_trip(me,target_trip_id)
    then raise exception 'Trip unavailable' using errcode='P0002'; end if;
  select * into saved from reactions_private.trip_reactions r where r.trip_id=target_trip_id and r.actor_group_id=me;
  if saved.kind is not distinct from reaction_kind then return reactions_private.summary(me,target_trip_id); end if;
  if reaction_kind is not null and (select count(*) from reactions_private.trip_reactions r
    where r.actor_group_id=me and r.updated_at>now()-interval '1 minute')>=30
    then raise exception 'Too many reactions' using errcode='54000'; end if;
  insert into reactions_private.trip_reactions(trip_id,actor_group_id,kind) values(target_trip_id,me,reaction_kind)
    on conflict(trip_id,actor_group_id) do update set kind=excluded.kind,updated_at=now() returning * into saved;
  perform reactions_private.notify(saved,target.group_id,target.description);
  return reactions_private.summary(me,target_trip_id);
end $$;

-- Only the trip's owner can see individual reactors. Others receive aggregates only.
create function public.get_my_trip_reactors(target_trip_id uuid,after_at timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  if target_trip_id is null or (after_at is null)<>(after_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
  if not exists(select 1 from public.trip_plans t where t.id=target_trip_id and t.group_id=me)
    then raise exception 'Trip unavailable' using errcode='P0002'; end if;
  with page as (
    select r.* from reactions_private.trip_reactions r where r.trip_id=target_trip_id and r.kind is not null
      and not messaging_private.pair_blocked(me,r.actor_group_id)
      and (after_at is null or (r.updated_at,r.id)<(after_at,after_id))
      order by r.updated_at desc,r.id desc limit 31
  ), entries as (
    select r.id,r.actor_group_id as group_id,g.name,g.avatar_id,r.kind,r.updated_at,
      favorites_private.can_view_group(me,g.id) as profile_available
      from page r join public.travel_groups g on g.id=r.actor_group_id order by r.updated_at desc,r.id desc limit 30
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(e) order by e.updated_at desc,e.id desc) from entries e),'[]'::jsonb),
    'has_more',(select count(*)>30 from page)) into result;
  return result;
end $$;
revoke all on all functions in schema reactions_private from public,anon,authenticated;
revoke all on function public.get_trip_reactions(uuid[]),public.set_my_trip_reaction(uuid,text),public.get_my_trip_reactors(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.get_trip_reactions(uuid[]),public.set_my_trip_reaction(uuid,text),public.get_my_trip_reactors(uuid,timestamptz,uuid) to authenticated;

create or replace function public.save_my_notification_preference(preference_key text,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); saved public.notification_preferences;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if preference_key is null or preference_key not in('messages','invitations','favorite_trips','reactions') or enabled is null
    then raise exception 'Invalid preference' using errcode='22023'; end if;
  insert into public.notification_preferences(group_id,push_messages,push_invitations,push_favorite_trips,push_reactions)
    values(me,case when preference_key='messages' then enabled else true end,
      case when preference_key='invitations' then enabled else true end,
      case when preference_key='favorite_trips' then enabled else true end,
      case when preference_key='reactions' then enabled else true end)
    on conflict(group_id) do update set
      push_messages=case when preference_key='messages' then enabled else public.notification_preferences.push_messages end,
      push_invitations=case when preference_key='invitations' then enabled else public.notification_preferences.push_invitations end,
      push_favorite_trips=case when preference_key='favorite_trips' then enabled else public.notification_preferences.push_favorite_trips end,
      push_reactions=case when preference_key='reactions' then enabled else public.notification_preferences.push_reactions end,
      updated_at=now() returning * into saved;
  if not enabled then
    update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='PreferenceDisabled'
      from push_private.events e where e.id=d.event_id and e.recipient_group_id=me and d.ticket_id is null
      and d.status in('pending','sending') and (preference_key='messages' and e.kind='message'
        or preference_key='invitations' and e.kind in('invitation_received','invitation_accepted')
        or preference_key='favorite_trips' and e.kind='favorite_trip' or preference_key='reactions' and e.kind='trip_reaction');
  end if;
  return to_jsonb(saved)-'group_id';
end $$;

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
          and exists(select 1 from favorites_private.group_favorites f where f.owner_group_id=e.recipient_group_id and f.target_group_id=e.actor_group_id)
        or e.kind='trip_reaction' and exists(select 1 from reactions_private.trip_reactions r join public.trip_plans t on t.id=r.trip_id
          where r.id=e.source_id and r.actor_group_id=e.actor_group_id and r.kind is not null and t.group_id=e.recipient_group_id
            and favorites_private.can_view_trip(e.actor_group_id,t.id))
      ));
$$;
create or replace function public.claim_push_deliveries(batch_size integer default 30)
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
      item.ticket_id,lease,item.attempts+1,case when e.kind='favorite_trip' then e.source_id
        when e.kind='trip_reaction' then (select r.trip_id from reactions_private.trip_reactions r where r.id=e.source_id) end
      from push_private.events e join public.push_devices d on d.id=item.device_id where e.id=item.event_id;
  end loop;
end $$;

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
      n.trip_label,n.own_trip_id,n.proposed_trip_id,n.invitation_id,n.reaction_kind,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r where r.id=n.source_id and r.kind is not null)
        else true end as reaction_active,
      coalesce(n.conversation_id,(select c.id from public.conversations c where c.invitation_id=n.invitation_id)) as conversation_id,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r join public.trip_plans t on t.id=r.trip_id
        where r.id=n.source_id and r.kind is not null and t.group_id=me)
      when n.kind='favorite_trip' then favorites_private.can_view_trip(me,n.proposed_trip_id)
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
      jsonb_build_object('push_messages',true,'push_invitations',true,'push_favorite_trips',true,'push_reactions',true,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end $$;
notify pgrst,'reload schema';
