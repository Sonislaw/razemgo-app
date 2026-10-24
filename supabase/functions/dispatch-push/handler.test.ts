Deno.test({name:'Private monitoring diagnostic is isolated from push dispatch and disabled in production',sanitizeOps:false,sanitizeResources:false,fn:async(t)=>{
  const variableNames=['SENTRY_DSN','SENTRY_ENVIRONMENT','SENTRY_RELEASE','PUSH_DISPATCH_SECRET','SUPABASE_URL','APP_SUPABASE_SECRET_KEY'];
  const previous=new Map(variableNames.map(name=>[name,Deno.env.get(name)]));
  const secret='a'.repeat(64);
  Deno.env.set('SENTRY_DSN','https://testonly@monitoring.razemgo.invalid/1');
  Deno.env.set('SENTRY_ENVIRONMENT','development');
  Deno.env.set('SENTRY_RELEASE','test');
  Deno.env.set('PUSH_DISPATCH_SECRET',secret);
  Deno.env.set('SUPABASE_URL','https://backend.razemgo.invalid');
  Deno.env.set('APP_SUPABASE_SECRET_KEY','server-only-test-key');
  const originalFetch=globalThis.fetch;
  const originalLog=console.log;
  const packets:string[]=[];
  const logs:string[]=[];
  let databaseCalls=0;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://monitoring.razemgo.invalid/')) {
      packets.push(typeof init?.body==='string' ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
      return Response.json({},{status:200});
    }
    if (url==='https://backend.razemgo.invalid/rest/v1/rpc/claim_push_deliveries') {
      databaseCalls++;
      return Response.json([]);
    }
    throw new Error('Unexpected network request in monitoring probe');
  };
  console.log=(value)=>{logs.push(String(value));};
  const assert=(ok:unknown,label:string)=>{if (!ok) throw new Error(label);};
  try {
    const {handlePushRequest}=await import('./handler.ts');
    const invoke=(key:string|null=secret,diagnostic:string|null='sentry-test',method='POST')=>handlePushRequest(new Request('https://edge.razemgo.invalid/dispatch-push',{
      method,headers:{...(key===null ? {} : {'x-push-dispatch-key':key}),...(diagnostic===null ? {} : {'x-razemgo-diagnostic':diagnostic})},
      ...(method==='POST' ? {body:'{"message":"private-message-body","token":"private-token"}'} : {}),
    }));
    await t.step('anonymous and incorrect credentials cannot generate reports',async()=>{
      for (const key of [null,'b'.repeat(64)]) assert((await invoke(key)).status===401,'Unauthorized diagnostic');
      assert((await invoke(secret,'sentry-test','GET')).status===405,'Method accepted');
      assert(packets.length===0 && databaseCalls===0,'Unauthorized request had side effects');
    });
    await t.step('production and unset environments cannot trigger the diagnostic',async()=>{
      Deno.env.set('SENTRY_ENVIRONMENT','production');
      assert((await invoke()).status===404,'Production diagnostic enabled');
      Deno.env.delete('SENTRY_ENVIRONMENT');
      assert((await invoke()).status===404,'Unconfigured diagnostic enabled');
      Deno.env.set('SENTRY_ENVIRONMENT','development');
      assert(packets.length===0 && databaseCalls===0,'Disabled request had side effects');
    });
    await t.step('a real SDK envelope confirms ingest status and excludes request contents',async()=>{
      const response=await invoke();
      const result=await response.json();
      assert(response.status===200 && result.accepted && result.statusCode===200,'Sentry acceptance not confirmed');
      assert(/^[a-f\d]{32}$/i.test(result.eventId),'Missing event id');
      assert(packets.length===1 && databaseCalls===0,'Diagnostic entered push worker');
      const payload=packets[0];
      assert(payload.includes(response.headers.get('x-request-id')!) && payload.includes(result.eventId),'Missing request correlation');
      assert(payload.includes('monitoring.test') && payload.includes('deno'),'Missing diagnostic tags');
      for (const privateValue of ['private-message-body','private-token',secret,'server-only-test-key'])
        assert(!(payload+logs.join('')).includes(privateValue),'Private diagnostic data escaped');
    });
    await t.step('repeated tests are limited and unknown diagnostics cannot dispatch',async()=>{
      assert((await invoke()).status===429,'Probe was not rate limited');
      assert((await invoke(secret,'unknown')).status===400,'Unknown diagnostic accepted');
      assert(packets.length===1 && databaseCalls===0,'Rejected test entered the worker');
    });
    await t.step('ordinary authenticated dispatcher calls retain their behavior',async()=>{
      const response=await invoke(secret,null);
      const stats=await response.json();
      assert(response.status===200 && stats.claimed===0 && databaseCalls===1,'Ordinary dispatcher changed');
      assert(packets.length===1,'Healthy dispatcher created an error event');
    });
  } finally {
    globalThis.fetch=originalFetch;
    console.log=originalLog;
    for (const [name,value] of previous) {
      if (value===undefined) Deno.env.delete(name); else Deno.env.set(name,value);
    }
  }
}});
