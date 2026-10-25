Deno.test({ name:'Isolated Dev heartbeat and diagnostic cannot use Preview monitor identity', sanitizeOps:false, sanitizeResources:false, fn:async()=>{
  const names=['SENTRY_DSN','SENTRY_ENVIRONMENT','SENTRY_RELEASE'];
  const previous=new Map(names.map(name=>[name,Deno.env.get(name)]));
  const originalFetch=globalThis.fetch;
  const originalLog=console.log;
  const packets:string[]=[];
  try {
    Deno.env.set('SENTRY_DSN','https://testonly@monitoring.razemgo.invalid/1');
    Deno.env.set('SENTRY_ENVIRONMENT','dev');
    Deno.env.set('SENTRY_RELEASE','isolated-dev-test');
    globalThis.fetch=async(_input,init)=>{
      packets.push(typeof init?.body==='string' ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
      return Response.json({},{status:200});
    };
    console.log=()=>{};
    const {sendPushMonitorHeartbeat,sendServerMonitoringTest}=await import('./monitoring.ts');
    const heartbeat=await sendPushMonitorHeartbeat(true);
    if (!heartbeat.accepted || heartbeat.statusCode!==200) throw new Error('Dev heartbeat was not accepted');
    const checkIn=JSON.parse(packets[0].split('\n')[2]);
    if (checkIn.monitor_slug!=='razemgo-push-health-dev' || checkIn.environment!=='dev') throw new Error('Dev overlaps Preview monitoring');
    const result=await sendServerMonitoringTest('00000000-0000-4000-8000-000000000001');
    if (!result.ok || !result.accepted) throw new Error('Dev private diagnostic unavailable');
    const event=JSON.parse(packets[1].split('\n')[2]);
    if (event.environment!=='dev') throw new Error('Dev event environment is incorrect');
  } finally {
    globalThis.fetch=originalFetch;console.log=originalLog;
    for(const [name,value] of previous) {if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value);}
  }
}});
