Deno.test({name:'Edge SDK emits safe context and a request id without copying server errors',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
  Deno.env.set('SENTRY_DSN','https://testonly@monitoring.razemgo.invalid/1');
  Deno.env.set('SENTRY_ENVIRONMENT','development');Deno.env.set('SENTRY_RELEASE','test');
  const packets:string[]=[];const logs:string[]=[];
  const originalFetch=globalThis.fetch;const originalError=console.error;const originalLog=console.log;
  globalThis.fetch=async(_input,init)=>{
    const payload=typeof init?.body==='string' ? init.body : new TextDecoder().decode(init?.body as Uint8Array);
    if(payload)packets.push(payload);
    return new Response('{}',{status:payload.includes('monitoring.test') ? 503 : 200});
  };
  console.error=(value)=>{logs.push(String(value));};
  console.log=(value)=>{logs.push(String(value));};
  try {
    const {reportServerFailure,sendServerMonitoringTest}=await import('./monitoring.ts');
    const requestId='00000000-0000-4000-8000-000000000001';
    const rejected=await sendServerMonitoringTest(requestId);
    if(!rejected.ok || rejected.accepted || rejected.statusCode!==503)throw new Error('Flushed but rejected events must not be reported as accepted');
    await reportServerFailure('server.delete_account',Object.assign(new Error('private-email@example.com'),{status:500,details:'private-token'}),requestId);
    await reportServerFailure('server.delete_account',{status:500,message:'another private token'},requestId);
    if(logs.filter(log=>log.includes('operation_failed')).length!==1)throw new Error('Server log throttling failed');
    if(!packets.length)throw new Error('Sentry transport not exercised');
    const all=packets.join('\n')+logs.join('\n');
    for(const secret of ['private-email','private-token','another private'])if(all.includes(secret))throw new Error('Private data in server report');
    if(!all.includes(requestId)||!all.includes('HTTP_500'))throw new Error('Missing technical context');
  } finally {globalThis.fetch=originalFetch;console.error=originalError;console.log=originalLog;}
}});
