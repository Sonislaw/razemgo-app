Deno.test({name:'Edge SDK emits safe context and a request id without copying server errors',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
  Deno.env.set('SENTRY_DSN','https://testonly@monitoring.razemgo.invalid/1');
  Deno.env.set('SENTRY_ENVIRONMENT','development');Deno.env.set('SENTRY_RELEASE','test');
  const packets:string[]=[];const logs:string[]=[];
  const originalFetch=globalThis.fetch;const originalError=console.error;
  globalThis.fetch=async(_input,init)=>{
    if(init?.body)packets.push(typeof init.body==='string' ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return new Response('{}',{status:200});
  };
  console.error=(value)=>{logs.push(String(value));};
  try {
    const {reportServerFailure}=await import('./monitoring.ts');
    const requestId='00000000-0000-4000-8000-000000000001';
    await reportServerFailure('server.delete_account',Object.assign(new Error('private-email@example.com'),{status:500,details:'private-token'}),requestId);
    await reportServerFailure('server.delete_account',{status:500,message:'another private token'},requestId);
    if(logs.length!==1)throw new Error('Server log throttling failed');
    if(!packets.length)throw new Error('Sentry transport not exercised');
    const all=packets.join('\n')+logs.join('\n');
    for(const secret of ['private-email','private-token','another private'])if(all.includes(secret))throw new Error('Private data in server report');
    if(!all.includes(requestId)||!all.includes('HTTP_500'))throw new Error('Missing technical context');
  } finally {globalThis.fetch=originalFetch;console.error=originalError;}
}});
