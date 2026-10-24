// Configure only the linked TEST project's dispatcher. No Firebase keys belong here.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
const match=readFileSync('.env.local','utf8').match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m);
if(!match || new URL(match[1].trim().replace(/^['"]|['"]$/g,'')).hostname!==ref+'.supabase.co')throw new Error('Linked project and app must match');
const key=randomBytes(32).toString('hex');
const envPath='.expo/push-dispatch-secret.env',sqlPath='.expo/configure-push-dispatch.sql';
function cli(command){
  const args=process.platform==='win32'?['/d','/s','/c','npx --yes supabase@latest '+command]:['--yes','supabase@latest',...command.split(' ')];
  const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:90000});
  if(result.status!==0)throw new Error('Supabase configuration failed; command output suppressed to protect dispatcher credentials');
}
try{
  writeFileSync(envPath,'PUSH_DISPATCH_SECRET='+key+'\n',{encoding:'utf8',mode:0o600});
  cli('secrets set --env-file '+envPath);
  writeFileSync(sqlPath,`begin;
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    do $$ declare secret_id uuid; begin
      select id into secret_id from vault.secrets where name='razemgo_push_dispatch_secret';
      if secret_id is null then perform vault.create_secret('${key}','razemgo_push_dispatch_secret');
      else perform vault.update_secret(secret_id,'${key}'); end if;
    end $$;
    create or replace function push_private.wake_dispatcher() returns void
    language plpgsql security definer set search_path='' as $$
    declare token text; begin
      if not exists(select 1 from push_private.deliveries d where
        d.status in('pending','ticketed') and d.due_at<=now()
        or d.status in('sending','checking') and d.claimed_at<now()-interval '2 minutes') then return; end if;
      select decrypted_secret into token from vault.decrypted_secrets where name='razemgo_push_dispatch_secret';
      if token is null then return; end if;
      perform net.http_post(url:='https://${ref}.supabase.co/functions/v1/dispatch-push',
        headers:=jsonb_build_object('Content-Type','application/json','x-push-dispatch-key',token),body:='{}'::jsonb,timeout_milliseconds:=25000);
    end $$;
    revoke all on function push_private.wake_dispatcher() from public,anon,authenticated;
    select cron.schedule('razemgo-dispatch-push','* * * * *','select push_private.wake_dispatcher();');
    select cron.schedule('razemgo-push-cleanup','0 3 * * *',$job$
      delete from push_private.events where expires_at<now()-interval '7 days';
    $job$);
    commit;
    select true as dispatcher_configured;`,{encoding:'utf8',mode:0o600});
  cli('db query --linked --file '+sqlPath);
  console.log('Dispatcher secret saved to Edge Functions and Vault; immediate wakeups and minute retry schedule configured.');
}finally{
  for(const path of [envPath,sqlPath])try{unlinkSync(path);}catch{}
}
