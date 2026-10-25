-- Service-only aggregates and durable alert leases. No user content is copied.
alter table push_private.deliveries add column outcome_at timestamptz;
-- Historical failures must not look like fresh incidents at deployment time.
update push_private.deliveries d set outcome_at=coalesce(d.claimed_at,e.created_at)
  from push_private.events e where e.id=d.event_id;
alter table push_private.deliveries alter column outcome_at set default now(),alter column outcome_at set not null;
create index push_delivery_outcome on push_private.deliveries(outcome_at) where error_code is not null;
create function push_private.touch_delivery_outcome() returns trigger
language plpgsql set search_path='' as $$ begin
  if (new.status,new.attempts,new.error_code) is distinct from (old.status,old.attempts,old.error_code) then new.outcome_at:=now(); end if;
  return new;
end $$;
create trigger push_delivery_outcome before update on push_private.deliveries
  for each row execute function push_private.touch_delivery_outcome();

create table push_private.health_state (
  singleton boolean primary key default true check(singleton),
  installed_at timestamptz not null default now(),
  last_checked_at timestamptz
);
insert into push_private.health_state(singleton) values(true);
create table push_private.health_alerts (
  code text primary key check(code in('PUSH_QUEUE_STALLED','PUSH_CREDENTIALS','PUSH_RETRIES','PUSH_DELIVERY_FAILURES','PUSH_SCHEDULE_INVALID','PUSH_DISPATCH_STOPPED')),
  active boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_reported_at timestamptz,
  last_attempted_at timestamptz,
  lease uuid,
  lease_until timestamptz
);
insert into push_private.health_alerts(code) values('PUSH_QUEUE_STALLED'),('PUSH_CREDENTIALS'),('PUSH_RETRIES'),
  ('PUSH_DELIVERY_FAILURES'),('PUSH_SCHEDULE_INVALID'),('PUSH_DISPATCH_STOPPED');
alter table push_private.health_state enable row level security;
alter table push_private.health_alerts enable row level security;
revoke all on push_private.health_state,push_private.health_alerts from public,anon,authenticated;
grant all on push_private.health_state,push_private.health_alerts to service_role;

create function public.get_push_health() returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; dispatcher_ok boolean:=false; monitor_ok boolean:=false; tick timestamptz; installed timestamptz;
begin
  -- Dynamic SQL keeps migrations testable without installing hosted extensions.
  -- Never return cron command text (it may contain credentials).
  if to_regclass('cron.job') is not null then
    execute $query$select exists(select 1 from cron.job where jobname='razemgo-dispatch-push' and active and schedule='* * * * *'),
      exists(select 1 from cron.job where jobname='razemgo-monitor-push' and active and schedule='*/5 * * * *')$query$
      into dispatcher_ok,monitor_ok;
    if to_regclass('cron.job_run_details') is not null then
      execute $query$select max(r.end_time) from cron.job_run_details r join cron.job j on j.jobid=r.jobid
        where j.jobname='razemgo-dispatch-push' and r.status='succeeded'$query$ into tick;
    end if;
  end if;
  select installed_at into installed from push_private.health_state where singleton;
  select jsonb_build_object(
    'pending',count(*) filter(where d.status='pending' and e.expires_at>now()),
    'awaiting_receipts',count(*) filter(where d.status='ticketed' and e.expires_at>now()),
    'in_flight',count(*) filter(where d.status in('sending','checking') and e.expires_at>now()),
    -- Due dates include the normal 15-minute receipt wait and retry backoff.
    'overdue',count(*) filter(where e.expires_at>now() and
      (d.status in('pending','ticketed') and d.due_at<now()-interval '10 minutes'
       or d.status in('sending','checking') and d.claimed_at<now()-interval '10 minutes')
      and push_private.deliverable(d.id)),
    'retrying',count(*) filter(where d.status in('pending','sending','ticketed','checking') and d.attempts>=4
      and e.expires_at>now() and d.error_code is not null and d.error_code not in('ReceiptPending','PreferenceDisabled','DeviceNotRegistered')
      and push_private.deliverable(d.id)),
    'failed_recent',count(*) filter(where d.status='failed' and d.outcome_at>now()-interval '1 hour'
      and coalesce(d.error_code,'') not in('DeviceNotRegistered','PreferenceDisabled')),
    'credential_errors',count(*) filter(where d.outcome_at>now()-interval '1 hour' and d.status in('pending','sending','ticketed','checking','failed')
      and d.error_code in('InvalidCredentials','MismatchSenderId','ExpoUnauthorized','ExpoForbidden'))
  ) into snapshot from push_private.deliveries d join push_private.events e on e.id=d.event_id;
  return snapshot || jsonb_build_object('dispatcher_schedule_ok',dispatcher_ok,'monitor_schedule_ok',monitor_ok,
    'dispatcher_tick_ok',coalesce(tick>now()-interval '10 minutes',installed>now()-interval '10 minutes'),
    'checked_at',now(),'last_dispatch_tick',tick);
end $$;

create function public.claim_push_health_alerts(active_codes text[])
returns table(code text,lease uuid)
language plpgsql security definer set search_path='' as $$
declare item push_private.health_alerts; new_lease uuid;
begin
  if active_codes is null or cardinality(active_codes)>6 or exists(
    select 1 from unnest(active_codes) c where c is null or not exists(select 1 from push_private.health_alerts a where a.code=c)
  ) then raise exception 'Invalid health codes' using errcode='22023'; end if;
  -- A database lock/lease survives new Edge isolates and concurrent monitors.
  perform pg_advisory_xact_lock(652771,1);
  update push_private.health_state set last_checked_at=now() where singleton;
  for item in select a.* from push_private.health_alerts a order by a.code for update loop
    if not item.code=any(active_codes) then
      update push_private.health_alerts a set active=false,lease=null,lease_until=null where a.code=item.code;
      continue;
    end if;
    if not item.active then
      update push_private.health_alerts a set active=true,first_seen_at=now(),last_reported_at=null,
        last_attempted_at=null,lease=null,lease_until=null where a.code=item.code;
      item.last_reported_at:=null; item.last_attempted_at:=null; item.lease_until:=null;
    end if;
    update push_private.health_alerts a set last_seen_at=now() where a.code=item.code;
    if (item.lease_until is null or item.lease_until<now())
      and (item.last_reported_at is null or item.last_reported_at<now()-interval '1 hour')
      and (item.last_attempted_at is null or item.last_attempted_at<now()-interval '5 minutes') then
      new_lease:=gen_random_uuid();
      update push_private.health_alerts a set lease=new_lease,lease_until=now()+interval '2 minutes',last_attempted_at=now() where a.code=item.code;
      return query select item.code,new_lease;
    end if;
  end loop;
end $$;

create function public.finish_push_health_alert(alert_code text,claim_lease uuid,accepted boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
  update push_private.health_alerts a set lease=null,lease_until=null,
    last_reported_at=case when accepted then now() else a.last_reported_at end
    where a.code=alert_code and a.lease=claim_lease and a.active;
end $$;

revoke all on function push_private.touch_delivery_outcome(),public.get_push_health(),public.claim_push_health_alerts(text[]),
  public.finish_push_health_alert(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.get_push_health(),public.claim_push_health_alerts(text[]),public.finish_push_health_alert(text,uuid,boolean) to service_role;
notify pgrst,'reload schema';
