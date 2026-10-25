// Schedules the independent health check without rotating any existing key.
import { mkdirSync,readFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
const appUrl=readFileSync('.env.local','utf8').match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
if (!/^[a-z0-9]+$/.test(ref) || !appUrl || new URL(appUrl).hostname!==ref+'.supabase.co') throw new Error('Linked project and app must match');
mkdirSync('.expo',{recursive:true});
const sqlPath='.expo/configure-push-health.sql';
try {
  writeFileSync(sqlPath,`begin;
    do $$ begin
      if not exists(select 1 from vault.decrypted_secrets where name='razemgo_push_dispatch_secret' and length(decrypted_secret)=64)
        then raise exception 'Configure the dispatcher first'; end if;
      if not exists(select 1 from cron.job where jobname='razemgo-dispatch-push' and active and schedule='* * * * *')
        then raise exception 'Dispatcher schedule is missing or disabled'; end if;
    end $$;
    create or replace function push_private.wake_monitor() returns void
    language plpgsql security definer set search_path='' as $$
    declare token text; begin
      select decrypted_secret into token from vault.decrypted_secrets where name='razemgo_push_dispatch_secret';
      if token is null then raise exception 'Monitoring key missing'; end if;
      perform net.http_post(url:='https://${ref}.supabase.co/functions/v1/monitor-push',
        headers:=jsonb_build_object('Content-Type','application/json','x-push-dispatch-key',token),body:='{}'::jsonb,timeout_milliseconds:=55000);
    end $$;
    revoke all on function push_private.wake_monitor() from public,anon,authenticated;
    select cron.schedule('razemgo-monitor-push','*/5 * * * *','select push_private.wake_monitor();');
    select cron.schedule('razemgo-push-health-cleanup','15 3 * * *',$job$
      delete from cron.job_run_details where end_time<now()-interval '7 days'
        and jobid in(select jobid from cron.job where jobname in('razemgo-dispatch-push','razemgo-monitor-push','razemgo-push-health-cleanup'));
    $job$);
    commit;
    select true as independent_push_health_scheduled;`);
  const command='npx --yes supabase@latest db query --linked --file '+sqlPath;
  const args=process.platform==='win32'?['/d','/s','/c',command]:['--yes','supabase@latest','db','query','--linked','--file',sqlPath];
  const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:90000});
  if (result.status!==0) throw new Error('Cannot schedule push monitoring; verify dispatcher, migration and cron extensions');
  console.log('Independent push health check scheduled every five minutes. Existing dispatcher credentials unchanged.');
} finally { try {unlinkSync(sqlPath);} catch {} }
