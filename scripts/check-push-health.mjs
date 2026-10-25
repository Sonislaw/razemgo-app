// Invokes the monitor, never the dispatcher. Only aggregate counters are shown.
import { mkdirSync,readFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
async function main() {
  const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
  const appUrl=readFileSync('.env.local','utf8').match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
  if (!/^[a-z0-9]+$/.test(ref) || !appUrl || new URL(appUrl).hostname!==ref+'.supabase.co') throw new Error('Linked project and app must match');
  mkdirSync('.expo',{recursive:true});
  const queryPath='.expo/check-push-health.sql';
  let key;
  try {
    writeFileSync(queryPath,"select decrypted_secret as dispatch_key from vault.decrypted_secrets where name='razemgo_push_dispatch_secret';");
    const command='npx --yes supabase@latest db query --linked --file '+queryPath;
    const args=process.platform==='win32'?['/d','/s','/c',command]:['--yes','supabase@latest','db','query','--linked','--file',queryPath];
    const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:60000});
    if (result.status!==0) throw new Error('Cannot read monitor configuration');
    key=JSON.parse(result.stdout).rows?.[0]?.dispatch_key;
    if (typeof key!=='string' || key.length!==64) throw new Error('Monitor key is not configured');
  } finally {try {unlinkSync(queryPath);} catch {}}
  const endpoint='https://'+ref+'.supabase.co/functions/v1/monitor-push';
  for (const headers of [{},{'x-push-dispatch-key':'0'.repeat(64)}]) {
    const denied=await fetch(endpoint,{method:'POST',headers,signal:AbortSignal.timeout(30000)});
    if (denied.status!==401) throw new Error('Unauthorized monitoring request accepted');
    await denied.body?.cancel();
  }
  const response=await fetch(endpoint,{method:'POST',headers:{'x-push-dispatch-key':key},signal:AbortSignal.timeout(55000)});
  const body=await response.json();
  if (!response.ok || !body.ok || !body.heartbeat_accepted) throw new Error('Push health check or Sentry heartbeat failed');
  console.log(JSON.stringify({project:ref,requestId:response.headers.get('x-request-id'),...body},null,2));
  if (!body.healthy) process.exitCode=1;
}
main().catch(()=>{console.error('Push health check failed. Verify the linked test project, migration, scheduler and Sentry configuration. Raw output is suppressed to protect server credentials.');process.exitCode=1;});
