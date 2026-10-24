// A health check, not a test push: refuses to run if there are active deliveries.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
if(!/^[a-z0-9]+$/.test(ref))throw new Error('Invalid linked project');
const queryPath='.expo/check-push-dispatch.sql';
async function main(){
  let snapshot;
  try{
    writeFileSync(queryPath,`select
      (select decrypted_secret from vault.decrypted_secrets where name='razemgo_push_dispatch_secret') as dispatch_key,
      (select count(*) from push_private.deliveries where status in('pending','sending','ticketed','checking')) as active_deliveries;`);
    const command='npx --yes supabase@latest db query --linked --file '+queryPath;
    const args=process.platform==='win32'?['/d','/s','/c',command]:['--yes','supabase@latest','db','query','--linked','--file',queryPath];
    const result=spawnSync(process.platform==='win32'?'cmd.exe':'npx',args,{encoding:'utf8',windowsHide:true,timeout:60000});
    if(result.status!==0)throw new Error('Cannot read dispatcher configuration; output suppressed');
    snapshot=JSON.parse(result.stdout).rows?.[0];
    if(!snapshot || snapshot.active_deliveries!==0)throw new Error('Active deliveries exist; refusing to dispatch real notifications from a health check');
    if(typeof snapshot.dispatch_key!=='string' || snapshot.dispatch_key.length!==64)throw new Error('Dispatcher is not configured');
  }finally{try{unlinkSync(queryPath);}catch{}}
  const endpoint='https://'+ref+'.supabase.co/functions/v1/dispatch-push';
  const denied=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
  if(denied.status!==401)throw new Error('Unauthenticated dispatcher was not rejected');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-push-dispatch-key':snapshot.dispatch_key},body:'{}',signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  if(!response.ok || body.claimed!==0)throw new Error('Dispatcher health check failed');
  console.log('Live dispatcher verified: unauthenticated requests denied; server-only key accepted; empty outbox processed without sending a push.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
