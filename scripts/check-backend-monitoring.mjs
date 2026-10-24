// Sends one technical Sentry event from the linked TEST project's Edge runtime.
// The diagnostic branch never claims deliveries or sends device notifications.
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

async function main() {
  const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
  if (!/^[a-z0-9]+$/.test(ref)) throw new Error('Invalid linked project');
  const appUrl=readFileSync('.env.local','utf8').match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
  if (!appUrl || new URL(appUrl).hostname!==ref+'.supabase.co') throw new Error('Linked project and app must match');
  mkdirSync('.expo',{recursive:true});
  const queryPath='.expo/check-backend-monitoring.sql';
  let dispatchKey;
  try {
    writeFileSync(queryPath,"select decrypted_secret as dispatch_key from vault.decrypted_secrets where name='razemgo_push_dispatch_secret';");
    const command='npx --yes supabase@latest db query --linked --file '+queryPath;
    const args=process.platform==='win32'?['/d','/s','/c',command]:['--yes','supabase@latest','db','query','--linked','--file',queryPath];
    const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:60000});
    if (result.status!==0) throw new Error('Cannot read dispatcher configuration; output suppressed');
    dispatchKey=JSON.parse(result.stdout).rows?.[0]?.dispatch_key;
    if (typeof dispatchKey!=='string' || dispatchKey.length!==64) throw new Error('Dispatcher key is not configured');
  } finally { try { unlinkSync(queryPath); } catch {} }

  const endpoint='https://'+ref+'.supabase.co/functions/v1/dispatch-push';
  const headers={'Content-Type':'application/json','x-razemgo-diagnostic':'sentry-test'};
  for (const key of [undefined,'0'.repeat(64)]) {
    const denied=await fetch(endpoint,{method:'POST',headers:{...headers,...(key ? {'x-push-dispatch-key':key} : {})},body:'{}',signal:AbortSignal.timeout(30000)});
    if (denied.status!==401) throw new Error('Monitoring diagnostic did not reject an unauthorized request');
    await denied.body?.cancel();
  }
  const response=await fetch(endpoint,{method:'POST',headers:{...headers,'x-push-dispatch-key':dispatchKey},body:'{}',signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  const requestId=response.headers.get('x-request-id');
  if (!response.ok || result.ok!==true || result.accepted!==true || result.statusCode<200 || result.statusCode>=300)
    throw new Error('Sentry did not confirm receipt (Edge HTTP '+response.status+'); check configuration or retry after one minute');
  if (!/^[a-f\d]{32}$/i.test(result.eventId) || !/^[a-f\d-]{36}$/i.test(requestId ?? ''))
    throw new Error('Monitoring response is missing valid event and request identifiers');
  console.log(JSON.stringify({project:ref,operation:'monitoring.test',platform:'deno',eventId:result.eventId,requestId,sentryHttpStatus:result.statusCode,accepted:true},null,2));
}
main().catch(()=>{console.error('Backend monitoring check failed. Verify the linked test project, backend DSN, development environment and retry after one minute. Diagnostic output is suppressed to protect server credentials.');process.exitCode=1;});
