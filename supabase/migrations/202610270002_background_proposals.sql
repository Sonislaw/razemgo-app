-- Dev: discover proposals without an open application. Existing notifications
-- are retained; installation does not replay old matches as phone alerts.
alter table public.notification_preferences add column push_proposals boolean not null default true;
alter table push_private.events drop constraint events_kind_check;
alter table push_private.events add constraint events_kind_check
  check(kind in('message','invitation_received','invitation_accepted','favorite_trip','trip_reaction','proposal'));

create table notifications_private.proposal_jobs (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade,
  queued_at timestamptz not null default now()
);
create index proposal_jobs_age on notifications_private.proposal_jobs(queued_at,trip_id);
create table notifications_private.proposal_seen (
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  proposed_trip_id uuid not null references public.trip_plans(id) on delete cascade,
  primary key(recipient_group_id,proposed_trip_id)
);
insert into notifications_private.proposal_seen
  select distinct recipient_group_id,proposed_trip_id from public.notifications
  where kind='proposal' and proposed_trip_id is not null on conflict do nothing;

create table notifications_private.proposal_push_batches (
  id uuid primary key default gen_random_uuid(),
  recipient_group_id uuid not null references public.travel_groups(id) on delete cascade,
  window_start timestamptz not null,
  unique(recipient_group_id,window_start)
);
create table notifications_private.proposal_push_items (
  batch_id uuid not null references notifications_private.proposal_push_batches(id) on delete cascade,
  notification_id uuid primary key references public.notifications(id) on delete cascade
);
create index proposal_push_items_batch on notifications_private.proposal_push_items(batch_id);
alter table notifications_private.proposal_jobs enable row level security;
alter table notifications_private.proposal_seen enable row level security;
alter table notifications_private.proposal_push_batches enable row level security;
alter table notifications_private.proposal_push_items enable row level security;
revoke all on notifications_private.proposal_jobs,notifications_private.proposal_seen,
  notifications_private.proposal_push_batches,notifications_private.proposal_push_items from public,anon,authenticated;

-- Same region/date/crew criteria as Find companions; no pet exclusions or
-- arbitrary percentage threshold. Both sides' access restrictions still apply.
create function notifications_private.proposal_matches(o public.trip_plans,p public.trip_plans) returns boolean
language sql stable security definer set search_path='' as $$
  select o.group_id<>p.group_id and o.status='published' and o.visibility='public' and o.end_date>current_date
    and p.status='published' and p.visibility='public' and p.end_date>current_date
    and greatest(o.start_date,p.start_date)<least(o.end_date,p.end_date)
    and favorites_private.can_view_trip(o.group_id,p.id) and favorites_private.can_view_trip(p.group_id,o.id)
    and exists(select 1 from public.travel_groups g where g.id=p.group_id
      and (cardinality(o.matching_group_kinds)=0 or g.kind=any(o.matching_group_kinds))
      and (cardinality(o.matching_child_age_bands)=0 or g.child_age_bands && o.matching_child_age_bands))
    and case
      when o.location_kind='country' and o.location_id='country:PL' then p.location_id like 'pl-%' or p.location_id='country:PL'
        or discovery_private.region_text(p.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie',
          'mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
      when o.location_kind='country' then o.location_id=p.location_id
      when coalesce(o.location_region,'')<>'' then discovery_private.region_text(o.location_region)=discovery_private.region_text(p.location_region)
      when o.location_kind='region' then discovery_private.region_text(o.location_name)=discovery_private.region_text(p.location_region) or o.location_id=p.location_id
      else o.location_id=p.location_id or messaging_private.search_text(o.location_name)=messaging_private.search_text(p.location_name) end;
$$;
create function notifications_private.proposal_available(n public.notifications) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trip_plans o join public.trip_plans p on p.id=n.proposed_trip_id
    where o.id=n.own_trip_id and o.group_id=n.recipient_group_id and notifications_private.proposal_matches(o,p));
$$;

create function notifications_private.queue_proposal_trip() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and new.visibility='public' and new.end_date>current_date then
    insert into notifications_private.proposal_jobs(trip_id) values(new.id)
      on conflict(trip_id) do update set queued_at=now();
  end if;
  return new;
end $$;
create trigger proposal_trip_changed after insert or update of status,visibility,start_date,end_date,
  location_id,location_name,location_region,location_kind,matching_group_kinds,matching_child_age_bands
  on public.trip_plans for each row execute function notifications_private.queue_proposal_trip();
create function notifications_private.queue_proposal_crew() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into notifications_private.proposal_jobs(trip_id)
    select id from public.trip_plans where group_id=new.id and status='published' and visibility='public' and end_date>current_date
    on conflict(trip_id) do update set queued_at=now();
  return new;
end $$;
create trigger proposal_crew_changed after update of kind,child_age_bands on public.travel_groups
  for each row when(old.kind is distinct from new.kind or old.child_age_bands is distinct from new.child_age_bands)
  execute function notifications_private.queue_proposal_crew();

-- Older inbox RPCs keep calling this function. Fetching history must now be
-- read-only with respect to proposal generation, including old app versions.
create or replace function notifications_private.refresh_proposals(me uuid) returns void
language plpgsql security definer set search_path='' as $$ begin return; end $$;

create function public.process_proposal_notifications(batch_size integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare work record; candidate record; entry public.notifications; inserted integer; processed integer:=0;
  created integer:=0; found_count integer; digest uuid; slot timestamptz; queued integer:=0;
begin
  if batch_size is null or batch_size<1 or batch_size>20 then raise exception 'Invalid batch size' using errcode='22023'; end if;
  -- One processor across cron, retries and manual service diagnostics.
  if not pg_try_advisory_xact_lock(270002,1) then return jsonb_build_object('processed',0,'created',0,'queued',0); end if;
  slot:=date_bin(interval '5 minutes',now(),timestamptz '2000-01-01');
  for work in select trip_id from notifications_private.proposal_jobs order by queued_at,trip_id
    for update skip locked limit batch_size loop
    found_count:=0;
    for candidate in
      with changed as materialized(select * from public.trip_plans where id=work.trip_id), pairs as (
        select o.id own_id,p.id proposed_id,o.group_id recipient,p.group_id actor,p.description,o.published_at own_published
          from changed o join public.trip_plans p on p.group_id<>o.group_id and p.start_date<o.end_date and p.end_date>o.start_date
          where notifications_private.proposal_matches(o,p)
        union all
        select o.id,p.id,o.group_id,p.group_id,p.description,o.published_at
          from changed p join public.trip_plans o on o.group_id<>p.group_id and o.start_date<p.end_date and o.end_date>p.start_date
          where notifications_private.proposal_matches(o,p)
      ) select distinct on(recipient,proposed_id) * from pairs x
        where not exists(select 1 from notifications_private.proposal_seen s
          where s.recipient_group_id=x.recipient and s.proposed_trip_id=x.proposed_id)
        order by recipient,proposed_id,own_published desc,own_id limit 200
    loop
      found_count:=found_count+1;
      insert into notifications_private.proposal_seen values(candidate.recipient,candidate.proposed_id) on conflict do nothing;
      get diagnostics inserted=row_count;
      if inserted=0 then continue; end if;
      insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id,own_trip_id,own_trip_reference,proposed_trip_id,trip_label)
        values(candidate.recipient,candidate.actor,'proposal',candidate.proposed_id,candidate.own_id,candidate.own_id,
          candidate.proposed_id,left(regexp_replace(candidate.description,'\s+',' ','g'),180)) on conflict do nothing returning * into entry;
      if entry.id is null then continue; end if;
      created:=created+1;
      if notifications_private.push_allowed(candidate.recipient,'proposal')
        and exists(select 1 from public.push_devices where group_id=candidate.recipient) then
        insert into notifications_private.proposal_push_batches(recipient_group_id,window_start) values(candidate.recipient,slot)
          on conflict(recipient_group_id,window_start) do update set window_start=excluded.window_start returning id into digest;
        insert into notifications_private.proposal_push_items values(digest,entry.id) on conflict do nothing;
        -- A digest has no single actor: blocking/deleting its first author must
        -- not discard unrelated eligible proposals. Items are checked separately.
        insert into push_private.events(id,kind,source_id,recipient_group_id,actor_group_id)
          values(digest,'proposal',digest,candidate.recipient,candidate.recipient) on conflict do nothing;
        insert into push_private.deliveries(event_id,device_id,due_at)
          select digest,d.id,slot+interval '5 minutes' from public.push_devices d where d.group_id=candidate.recipient
          on conflict do nothing;
        get diagnostics inserted=row_count; queued:=queued+inserted;
      end if;
    end loop;
    -- A high-volume publication continues next tick, never drops matches after
    -- the batch boundary and never blocks saving a user's trip.
    if found_count<200 then delete from notifications_private.proposal_jobs where trip_id=work.trip_id;
    else update notifications_private.proposal_jobs set queued_at=now() where trip_id=work.trip_id; end if;
    processed:=processed+1;
  end loop;
  delete from notifications_private.proposal_push_batches where window_start<now()-interval '8 days';
  return jsonb_build_object('processed',processed,'created',created,'queued',queued);
end $$;
revoke all on function public.process_proposal_notifications(integer) from public,anon,authenticated;
grant execute on function public.process_proposal_notifications(integer) to service_role;
revoke all on function notifications_private.proposal_matches(public.trip_plans,public.trip_plans),
  notifications_private.proposal_available(public.notifications),notifications_private.queue_proposal_trip(),
  notifications_private.queue_proposal_crew() from public,anon,authenticated;

-- pg_cron already exists on hosted Dev for push. Pure SQL tests intentionally
-- omit the extension; no HTTP secrets or credentials are stored in this job.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('razemgo-proposals','* * * * *','select public.process_proposal_notifications(10);');
  end if;
end $$;

create or replace function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case event_kind when 'message' then p.push_messages
    when 'favorite_trip' then p.push_favorite_trips when 'trip_reaction' then p.push_reactions when 'proposal' then p.push_proposals
    when 'invitation_received' then p.push_invitations when 'invitation_accepted' then p.push_invitations
    else false end from public.notification_preferences p where p.group_id=recipient),
    event_kind in('message','invitation_received','invitation_accepted','favorite_trip','trip_reaction','proposal'));
$$;

create or replace function public.save_my_notification_preference(preference_key text,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); saved public.notification_preferences;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if preference_key is null or preference_key not in('messages','invitations','favorite_trips','reactions','proposals') or enabled is null
    then raise exception 'Invalid preference' using errcode='22023'; end if;
  insert into public.notification_preferences(group_id,push_messages,push_invitations,push_favorite_trips,push_reactions,push_proposals)
    values(me,case when preference_key='messages' then enabled else true end,
      case when preference_key='invitations' then enabled else true end,
      case when preference_key='favorite_trips' then enabled else true end,
      case when preference_key='reactions' then enabled else true end,
      case when preference_key='proposals' then enabled else true end)
    on conflict(group_id) do update set
      push_messages=case when preference_key='messages' then enabled else public.notification_preferences.push_messages end,
      push_invitations=case when preference_key='invitations' then enabled else public.notification_preferences.push_invitations end,
      push_favorite_trips=case when preference_key='favorite_trips' then enabled else public.notification_preferences.push_favorite_trips end,
      push_reactions=case when preference_key='reactions' then enabled else public.notification_preferences.push_reactions end,
      push_proposals=case when preference_key='proposals' then enabled else public.notification_preferences.push_proposals end,
      updated_at=now() returning * into saved;
  if not enabled then
    update push_private.deliveries d set status='skipped',claim_key=null,claimed_at=null,error_code='PreferenceDisabled'
      from push_private.events e where e.id=d.event_id and e.recipient_group_id=me and d.ticket_id is null
      and d.status in('pending','sending') and (preference_key='messages' and e.kind='message'
        or preference_key='invitations' and e.kind in('invitation_received','invitation_accepted')
        or preference_key='favorite_trips' and e.kind='favorite_trip' or preference_key='reactions' and e.kind='trip_reaction' or preference_key='proposals' and e.kind='proposal');
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
        or e.kind='proposal' and exists(select 1 from notifications_private.proposal_push_items i
          join public.notifications n on n.id=i.notification_id where i.batch_id=e.source_id and n.read_at is null
            and n.recipient_group_id=e.recipient_group_id and notifications_private.proposal_available(n))
      ));
$$;

drop function public.claim_push_deliveries(integer);

create or replace function public.claim_push_deliveries(batch_size integer default 30)
returns table(delivery_id uuid,event_id uuid,device_id uuid,push_token text,kind text,recipient_group_id uuid,
  invitation_id uuid,conversation_id uuid,ticket_id text,claim_key uuid,attempts integer,trip_id uuid,notification_id uuid,proposal_count integer)
language plpgsql security definer set search_path='' as $$
declare item push_private.deliveries; lease uuid; chosen uuid; chosen_trip uuid; proposal_total integer;
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
    chosen:=null; chosen_trip:=null; proposal_total:=0;
    if exists(select 1 from push_private.events check_event where check_event.id=item.event_id and check_event.kind='proposal') then
      select count(*)::integer,(array_agg(n.id order by n.created_at desc,n.id))[1],
        (array_agg(n.proposed_trip_id order by n.created_at desc,n.id))[1] into proposal_total,chosen,chosen_trip
        from notifications_private.proposal_push_items i join public.notifications n on n.id=i.notification_id
        where i.batch_id=(select source_id from push_private.events where id=item.event_id)
          and n.read_at is null and notifications_private.proposal_available(n);
    end if;
    lease:=gen_random_uuid();
    update push_private.deliveries set status=case when item.ticket_id is null then 'sending' else 'checking' end,
      attempts=item.attempts+1,claim_key=lease,claimed_at=now() where id=item.id;
    return query select item.id,e.id,d.id,d.expo_push_token,e.kind,e.recipient_group_id,e.invitation_id,e.conversation_id,
      item.ticket_id,lease,item.attempts+1,case when e.kind='proposal' then chosen_trip when e.kind='favorite_trip' then e.source_id
        when e.kind='trip_reaction' then (select r.trip_id from reactions_private.trip_reactions r where r.id=e.source_id) end,chosen,proposal_total
      from push_private.events e join public.push_devices d on d.id=item.device_id where e.id=item.event_id;
  end loop;
end $$;

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
    select n.id,n.kind,n.created_at,n.read_at,n.actor_group_id,g.name as actor_name,g.avatar_id as actor_avatar_id,g.crew_number as actor_crew_number,
      n.trip_label,n.own_trip_id,n.proposed_trip_id,n.invitation_id,n.reaction_kind,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r where r.id=n.source_id and r.kind is not null)
        else true end as reaction_active,
      coalesce(n.conversation_id,(select c.id from public.conversations c where c.invitation_id=n.invitation_id)) as conversation_id,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r join public.trip_plans t on t.id=r.trip_id
        where r.id=n.source_id and r.kind is not null and t.group_id=me)
      when n.kind='favorite_trip' then favorites_private.can_view_trip(me,n.proposed_trip_id)
      when n.kind='proposal' then notifications_private.proposal_available(n)
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
      jsonb_build_object('push_messages',true,'push_invitations',true,'push_favorite_trips',true,'push_reactions',true,'push_proposals',true,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end $$;

notify pgrst,'reload schema';
