-- Explicit opt-in, future publications only, one closed five-minute digest per set.
alter table discovery_private.saved_filter_sets
  add column notifications_enabled boolean not null default false,
  add column alerts_started_at timestamptz,
  add column alert_generation uuid not null default gen_random_uuid(),
  add constraint filter_alerts_trips_only check(not notifications_enabled or kind='trips');
alter table public.notification_preferences add column push_saved_filters boolean not null default true;
alter table public.notifications add column filter_set_id uuid references discovery_private.saved_filter_sets(id) on delete set null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check(kind in('message','invitation_received','invitation_accepted','proposal','favorite_trip','trip_reaction','saved_filter'));
alter table public.notifications drop constraint notifications_check;
alter table public.notifications add constraint notifications_check
  check(recipient_group_id<>actor_group_id or kind='saved_filter');
alter table push_private.events drop constraint events_kind_check;
alter table push_private.events add constraint events_kind_check
  check(kind in('message','invitation_received','invitation_accepted','proposal','favorite_trip','trip_reaction','saved_filter'));

create table notifications_private.filter_publications (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade,
  first_published_at timestamptz not null default clock_timestamp()
);
-- Include previous first publications even when currently paused or private.
insert into notifications_private.filter_publications(trip_id,first_published_at)
  select t.id,coalesce(t.published_at,now()) from public.trip_plans t
  where t.published_at is not null or exists(select 1 from notifications_private.favorite_trip_publications p where p.trip_id=t.id);
create table notifications_private.filter_alert_jobs (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade,
  queued_at timestamptz not null default now()
);
create table notifications_private.filter_alert_seen (
  filter_set_id uuid not null references discovery_private.saved_filter_sets(id) on delete cascade,
  trip_id uuid not null references public.trip_plans(id) on delete cascade,
  primary key(filter_set_id,trip_id)
);
create table notifications_private.filter_alert_batches (
  id uuid primary key default gen_random_uuid(),
  filter_set_id uuid not null references discovery_private.saved_filter_sets(id) on delete cascade,
  generation uuid not null,
  window_start timestamptz not null,
  due_at timestamptz not null,
  finalized_at timestamptz,
  unique(filter_set_id,generation,window_start)
);
create index filter_alert_batches_due on notifications_private.filter_alert_batches(due_at) where finalized_at is null;
create table notifications_private.filter_alert_items (
  batch_id uuid not null references notifications_private.filter_alert_batches(id) on delete cascade,
  trip_id uuid not null references public.trip_plans(id) on delete cascade,
  primary key(batch_id,trip_id)
);
do $$ declare tab text; begin
  foreach tab in array array['filter_publications','filter_alert_jobs','filter_alert_seen','filter_alert_batches','filter_alert_items'] loop
    execute format('alter table notifications_private.%I enable row level security',tab);
    execute format('revoke all on notifications_private.%I from public,anon,authenticated',tab);
  end loop;
end $$;

create function notifications_private.filter_alert_count(batch uuid) returns integer
language sql stable security definer set search_path='' as $$
  select count(*)::integer from notifications_private.filter_alert_batches b
    join discovery_private.saved_filter_sets s on s.id=b.filter_set_id and s.alert_generation=b.generation
    join notifications_private.filter_alert_items i on i.batch_id=b.id
    cross join lateral discovery_private.candidates(s.filters,s.owner_group_id) t
  where b.id=batch and t.id=i.trip_id
    and (s.filters->>'end_date' is null or (s.filters->>'end_date')::date>current_date);
$$;

create function discovery_private.filter_alert_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.filters is distinct from old.filters or new.notifications_enabled and not old.notifications_enabled then
    new.alerts_started_at:=clock_timestamp(); new.alert_generation:=gen_random_uuid();
  end if;
  if new.kind='trips' and new.filters->>'end_date' is not null and (new.filters->>'end_date')::date<=current_date then
    new.notifications_enabled:=false;
  end if;
  return new;
end $$;
create trigger filter_alert_settings before update on discovery_private.saved_filter_sets
  for each row execute function discovery_private.filter_alert_settings();
create function discovery_private.cancel_filter_alerts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.notifications_enabled and new.alert_generation=old.alert_generation then return null; end if;
  update push_private.deliveries d set status='skipped',claim_key=null from push_private.events e
    join notifications_private.filter_alert_batches b on b.id=e.source_id
    where d.event_id=e.id and e.kind='saved_filter' and b.filter_set_id=old.id
      and d.ticket_id is null and d.status in('pending','sending');
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger cancel_filter_alert_update after update on discovery_private.saved_filter_sets
  for each row execute function discovery_private.cancel_filter_alerts();
create trigger cancel_filter_alert_delete before delete on discovery_private.saved_filter_sets
  for each row execute function discovery_private.cancel_filter_alerts();

create function public.set_my_filter_set_notifications(target_id uuid,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); item discovery_private.saved_filter_sets;
begin
  if target_id is null or enabled is null then raise exception 'Invalid settings' using errcode='22023'; end if;
  perform 1 from public.travel_groups where id=me for update;
  select * into item from discovery_private.saved_filter_sets where id=target_id and owner_group_id=me for update;
  if not found then raise exception 'Filter set unavailable' using errcode='P0002'; end if;
  if item.kind<>'trips' or enabled and item.filters->>'end_date' is not null and (item.filters->>'end_date')::date<=current_date then
    raise exception 'Only future trip filters can be followed' using errcode='22023';
  end if;
  if item.notifications_enabled is distinct from enabled then
    update discovery_private.saved_filter_sets set notifications_enabled=enabled,updated_at=now()
      where id=item.id returning * into item;
  end if;
  return to_jsonb(item)-'owner_group_id';
end $$;
revoke all on function public.set_my_filter_set_notifications(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_my_filter_set_notifications(uuid,boolean) to authenticated;

create function notifications_private.queue_filter_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare first_id uuid;
begin
  if new.status<>'published' or new.visibility<>'public' or new.end_date<=current_date then return new; end if;
  insert into notifications_private.filter_publications(trip_id) values(new.id) on conflict do nothing returning trip_id into first_id;
  if first_id is not null and exists(select 1 from discovery_private.saved_filter_sets where notifications_enabled) then
    insert into notifications_private.filter_alert_jobs(trip_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger queue_filter_publication after insert or update of status,visibility on public.trip_plans
  for each row execute function notifications_private.queue_filter_publication();

-- Preserve old categories and dispatcher behavior through private implementations.
alter function notifications_private.push_allowed(uuid,text) rename to push_allowed_before_filter_alerts;
create function notifications_private.push_allowed(recipient uuid,event_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select case when event_kind='saved_filter' then coalesce((select push_saved_filters from public.notification_preferences where group_id=recipient),true)
    else notifications_private.push_allowed_before_filter_alerts(recipient,event_kind) end;
$$;
alter function public.save_my_notification_preference(text,boolean) rename to save_preference_before_filter_alerts;
alter function public.save_preference_before_filter_alerts(text,boolean) set schema notifications_private;
revoke all on function notifications_private.save_preference_before_filter_alerts(text,boolean) from public,anon,authenticated;
create function public.save_my_notification_preference(preference_key text,enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); saved public.notification_preferences;
begin
  if preference_key is distinct from 'saved_filters' then return notifications_private.save_preference_before_filter_alerts(preference_key,enabled); end if;
  if enabled is null then raise exception 'Invalid preference' using errcode='22023'; end if;
  insert into public.notification_preferences(group_id,push_saved_filters) values(me,enabled)
    on conflict(group_id) do update set push_saved_filters=excluded.push_saved_filters,updated_at=now() returning * into saved;
  if not enabled then
    update push_private.deliveries d set status='skipped',claim_key=null from push_private.events e
      where d.event_id=e.id and e.recipient_group_id=me and e.kind='saved_filter'
        and d.ticket_id is null and d.status in('pending','sending');
  end if;
  return to_jsonb(saved)-'group_id';
end $$;
revoke all on function public.save_my_notification_preference(text,boolean) from public,anon,authenticated;
grant execute on function public.save_my_notification_preference(text,boolean) to authenticated;

create function public.process_filter_notifications(batch_size integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare work record; candidate record; digest record; n public.notifications; item_count integer; inserted integer;
  found_count integer; processed integer:=0; created integer:=0; slot timestamptz;
begin
  if batch_size is null or batch_size<1 or batch_size>20 then raise exception 'Invalid batch size' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(311002,1) then return jsonb_build_object('processed',0,'created',0); end if;
  slot:=date_bin(interval '5 minutes',now(),timestamptz '2000-01-01');
  for work in select * from notifications_private.filter_alert_jobs order by queued_at,trip_id
    for update skip locked limit batch_size loop
    found_count:=0;
    for candidate in
      select s.* from discovery_private.saved_filter_sets s
        join notifications_private.filter_publications p on p.trip_id=work.trip_id and p.first_published_at>=s.alerts_started_at
      where s.notifications_enabled and s.kind='trips'
        and (s.filters->>'end_date' is null or (s.filters->>'end_date')::date>current_date)
        and not exists(select 1 from notifications_private.filter_alert_seen seen where seen.filter_set_id=s.id and seen.trip_id=work.trip_id)
        and exists(select 1 from discovery_private.candidates(s.filters,s.owner_group_id) t where t.id=work.trip_id)
      order by s.id limit 200 for update of s
    loop
      found_count:=found_count+1;
      insert into notifications_private.filter_alert_seen values(candidate.id,work.trip_id) on conflict do nothing;
      get diagnostics inserted=row_count;
      if inserted=0 then continue; end if;
      insert into notifications_private.filter_alert_batches(filter_set_id,generation,window_start,due_at)
        values(candidate.id,candidate.alert_generation,slot,slot+interval '5 minutes')
        on conflict(filter_set_id,generation,window_start) do update set window_start=excluded.window_start returning * into digest;
      insert into notifications_private.filter_alert_items values(digest.id,work.trip_id) on conflict do nothing;
    end loop;
    if found_count<200 then delete from notifications_private.filter_alert_jobs where trip_id=work.trip_id;
    else update notifications_private.filter_alert_jobs set queued_at=now() where trip_id=work.trip_id; end if;
    processed:=processed+1;
  end loop;
  for digest in select b.*,s.owner_group_id,s.name,s.notifications_enabled,s.alert_generation from notifications_private.filter_alert_batches b
    join discovery_private.saved_filter_sets s on s.id=b.filter_set_id
    where b.finalized_at is null and b.due_at<=now() order by b.due_at,b.id limit 100 for update of b,s
  loop
    update notifications_private.filter_alert_batches set finalized_at=now() where id=digest.id;
    if not digest.notifications_enabled or digest.generation<>digest.alert_generation then continue; end if;
    item_count:=notifications_private.filter_alert_count(digest.id);
    if item_count=0 then continue; end if;
    insert into public.notifications(id,recipient_group_id,actor_group_id,kind,source_id,filter_set_id,trip_label)
      values(digest.id,digest.owner_group_id,digest.owner_group_id,'saved_filter',digest.id,digest.filter_set_id,digest.name)
      on conflict do nothing returning * into n;
    if n.id is null then continue; end if;
    created:=created+1;
    if notifications_private.push_allowed(digest.owner_group_id,'saved_filter') then
      insert into push_private.events(id,kind,source_id,recipient_group_id,actor_group_id)
        values(digest.id,'saved_filter',digest.id,digest.owner_group_id,digest.owner_group_id) on conflict do nothing;
      insert into push_private.deliveries(event_id,device_id)
        select digest.id,d.id from public.push_devices d where d.group_id=digest.owner_group_id on conflict do nothing;
    end if;
  end loop;
  -- Keep recent digest details; lifetime per-set deduplication remains separate.
  delete from notifications_private.filter_alert_batches where finalized_at<now()-interval '30 days';
  return jsonb_build_object('processed',processed,'created',created);
end $$;
revoke all on function public.process_filter_notifications(integer) from public,anon,authenticated;
grant execute on function public.process_filter_notifications(integer) to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('razemgo-saved-filters','* * * * *','select public.process_filter_notifications(10);');
  end if;
end $$;

alter function push_private.deliverable(uuid) rename to deliverable_before_filter_alerts;
create function push_private.deliverable(delivery uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case when e.kind='saved_filter' then
    d.group_id=e.recipient_group_id and (a.not_after is null or a.not_after>now()) and e.expires_at>now()
    and notifications_private.push_allowed(e.recipient_group_id,e.kind)
    and n.read_at is null and n.id is not null and s.notifications_enabled and s.owner_group_id=e.recipient_group_id
    and notifications_private.filter_alert_count(e.source_id)>0
    else push_private.deliverable_before_filter_alerts(delivery) end
  from push_private.deliveries x join push_private.events e on e.id=x.event_id
    join public.push_devices d on d.id=x.device_id join auth.sessions a on a.id=d.session_id
    left join public.notifications n on n.id=e.id
    left join discovery_private.saved_filter_sets s on s.id=n.filter_set_id
  where x.id=delivery),false);
$$;

alter function public.claim_push_deliveries(integer) rename to claim_before_filter_alerts;
alter function public.claim_before_filter_alerts(integer) set schema push_private;
create function public.claim_push_deliveries(batch_size integer default 30)
returns table(delivery_id uuid,event_id uuid,device_id uuid,push_token text,kind text,recipient_group_id uuid,
  invitation_id uuid,conversation_id uuid,ticket_id text,claim_key uuid,attempts integer,trip_id uuid,notification_id uuid,proposal_count integer,filter_set_id uuid)
language sql security definer set search_path='' as $$
  select j.delivery_id,j.event_id,j.device_id,j.push_token,j.kind,j.recipient_group_id,j.invitation_id,j.conversation_id,
    j.ticket_id,j.claim_key,j.attempts,j.trip_id,case when j.kind='saved_filter' then j.event_id else j.notification_id end,
    case when j.kind='saved_filter' then notifications_private.filter_alert_count(j.event_id) else j.proposal_count end,
    case when j.kind='saved_filter' then (select n.filter_set_id from public.notifications n where n.id=j.event_id) end
  from push_private.claim_before_filter_alerts(batch_size) j;
$$;
revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

-- Extend the existing page without altering the previous categories or cursors.
alter function public.get_my_notifications(timestamptz,uuid,integer,boolean) rename to get_notifications_before_filter_alerts;
alter function public.get_notifications_before_filter_alerts(timestamptz,uuid,integer,boolean) set schema notifications_private;
revoke all on function notifications_private.get_notifications_before_filter_alerts(timestamptz,uuid,integer,boolean) from public,anon,authenticated;
create function public.get_my_notifications(before_at timestamptz default null,before_id uuid default null,page_size integer default 30,only_unread boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb; entries jsonb;
begin
  result:=notifications_private.get_notifications_before_filter_alerts(before_at,before_id,page_size,only_unread);
  select coalesce(jsonb_agg(case when e->>'kind'='saved_filter' then e||jsonb_build_object(
    'filter_set_id',n.filter_set_id,'actor_name','Zapisane filtry','trip_label',coalesce(s.name,n.trip_label),
    'filter_result_count',notifications_private.filter_alert_count(n.source_id),
    'available',s.id is not null and notifications_private.filter_alert_count(n.source_id)>0) else e end order by ord),'[]'::jsonb)
    into entries from jsonb_array_elements(result->'items') with ordinality rows(e,ord)
      join public.notifications n on n.id=(e->>'id')::uuid and n.recipient_group_id=me
      left join discovery_private.saved_filter_sets s on s.id=n.filter_set_id;
  result:=jsonb_set(result,'{items}',entries);
  return jsonb_set(result,'{preferences}',result->'preferences'||jsonb_build_object('push_saved_filters',
    coalesce((select push_saved_filters from public.notification_preferences where group_id=me),true)));
end $$;
revoke all on function public.get_my_notifications(timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.get_my_notifications(timestamptz,uuid,integer,boolean) to authenticated;

revoke all on function notifications_private.filter_alert_count(uuid),discovery_private.filter_alert_settings(),
  discovery_private.cancel_filter_alerts(),notifications_private.queue_filter_publication(),
  notifications_private.push_allowed(uuid,text),push_private.deliverable(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
