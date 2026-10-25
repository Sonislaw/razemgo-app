-- Only aggregate scheduler state; never return job commands or Vault values.
select j.jobname,j.schedule,j.active,
  (select max(r.end_time) from cron.job_run_details r where r.jobid=j.jobid and r.status='succeeded') as last_successful_tick,
  s.last_checked_at,
  case when j.jobname='razemgo-monitor-push' then exists(
    select 1 from cron.job_run_details r where r.jobid=j.jobid and r.status='succeeded'
      and r.start_time>now()-interval '10 minutes' and s.last_checked_at>=r.start_time
  ) else null end as scheduled_monitor_completed
from cron.job j cross join push_private.health_state s
where j.jobname in('razemgo-dispatch-push','razemgo-monitor-push','razemgo-push-health-cleanup')
order by j.jobname;

-- Confirm the HTTP outcome of a scheduled monitor call, not only the SQL tick.
-- The CASE guard prevents parsing unrelated HTML/error responses as JSON.
select r.created,r.status_code,
  (case when r.content like '{"healthy":%' then r.content::jsonb else '{}'::jsonb end)->'healthy' as queue_healthy,
  (case when r.content like '{"healthy":%' then r.content::jsonb else '{}'::jsonb end)->'heartbeat_accepted' as sentry_heartbeat_accepted,
  (case when r.content like '{"healthy":%' then r.content::jsonb else '{}'::jsonb end)->'heartbeat_http_status' as sentry_http_status
from net._http_response r
where r.content like '{"healthy":%' and r.created>=(
  select max(d.start_time) from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where j.jobname='razemgo-monitor-push' and d.status='succeeded'
)
order by r.created desc limit 1;
