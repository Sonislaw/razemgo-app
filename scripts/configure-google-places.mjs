import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
const env=parseEnv(readFileSync('.env.local','utf8'));
const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
if(ref!=='kswuakzcnoqgovnwejhb'||new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname!==ref+'.supabase.co')throw Error('Google Places scheduler requires Dev.');
const file=resolve('.expo/configure-google-places.local.sql');
try {
  writeFileSync(file,`begin;
    do $$ begin
      if not exists(select 1 from vault.decrypted_secrets where name='razemgo_push_dispatch_secret' and length(decrypted_secret)=64)
        then raise exception 'Dispatcher configuration required';end if;
    end $$;
    create or replace function places_private.wake_refresh() returns void
    language plpgsql security definer set search_path='' as $$
    declare token text;begin
      select decrypted_secret into token from vault.decrypted_secrets where name='razemgo_push_dispatch_secret';
      if token is null then raise exception 'Configuration required';end if;
      perform net.http_post(url:='https://${ref}.supabase.co/functions/v1/places',
        headers:=jsonb_build_object('Content-Type','application/json','x-push-dispatch-key',token),body:='{}'::jsonb,timeout_milliseconds:=55000);
    end $$;
    revoke all on function places_private.wake_refresh() from public,anon,authenticated;
    select cron.schedule('razemgo-refresh-google-places','*/5 * * * *','select places_private.wake_refresh();');
    commit;`);
  const npx=join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js');
  const result=spawnSync(process.execPath,[npx,'--yes','supabase@2.122.0','db','query','--linked','--file',file],{encoding:'utf8',windowsHide:true,timeout:90000});
  if(result.status!==0)throw Error('Cannot configure Google Places maintenance; raw database output suppressed.');
  console.log('Dev: scheduled geometry refresh every five minutes; existing credentials preserved.');
}finally{try{unlinkSync(file);}catch{}}
