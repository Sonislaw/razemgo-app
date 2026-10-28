Deno.test({name:'Independent push monitor authenticates, filters payloads, reports incidents and checks in to Sentry',sanitizeOps:false,sanitizeResources:false,fn:async(t)=>{
  const names=['SENTRY_DSN','SENTRY_ENVIRONMENT','SENTRY_RELEASE','PUSH_DISPATCH_SECRET','SUPABASE_URL','APP_SUPABASE_SECRET_KEY'];
  const previous=new Map(names.map(name=>[name,Deno.env.get(name)]));
  const secret='b'.repeat(64),lease='00000000-0000-4000-8000-000000000001';
  Deno.env.set('SENTRY_DSN','https://testonly@monitoring.razemgo.invalid/1');
  Deno.env.set('SENTRY_ENVIRONMENT','development');Deno.env.set('SENTRY_RELEASE','test');
  Deno.env.set('PUSH_DISPATCH_SECRET',secret);Deno.env.set('SUPABASE_URL','https://backend.razemgo.invalid');
  Deno.env.set('APP_SUPABASE_SECRET_KEY','private-server-key');
  const originalFetch=globalThis.fetch,originalLog=console.log,originalError=console.error;
  const packets:string[]=[],logs:string[]=[],calls:{name:string;body:Record<string,unknown>}[]=[];
  let incident=false,backendFailure=false,sentryStatus=200,proposalIncident=false,legacySnapshot=false;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://monitoring.razemgo.invalid/')) {
      packets.push(typeof init?.body==='string' ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
      return Response.json({},{status:sentryStatus});
    }
    if (url.startsWith('https://backend.razemgo.invalid/rest/v1/rpc/')) {
      const name=url.split('/').at(-1)!;calls.push({name,body:JSON.parse(String(init?.body ?? '{}'))});
      if (name==='get_push_health') return backendFailure ? Response.json({code:'XX000',message:'private-db-error'},{status:500}) : Response.json({
        pending:0,awaiting_receipts:0,in_flight:0,overdue:0,retrying:0,failed_recent:0,credential_errors:incident ? 1 : 0,
        dispatcher_schedule_ok:true,monitor_schedule_ok:true,dispatcher_tick_ok:true,private_field:'private-snapshot',
        ...(!legacySnapshot ? {proposal_pending:0,proposal_overdue:proposalIncident ? 1 : 0,proposal_schedule_ok:true,proposal_tick_ok:true,last_proposal_tick:null} : {}),
      });
      if (name==='claim_push_health_alerts') return Response.json(incident ? [{code:'PUSH_CREDENTIALS',lease}] : proposalIncident ? [{code:'PROPOSAL_QUEUE_STALLED',lease}] : []);
      if (name==='finish_push_health_alert') return Response.json(null);
    }
    throw new Error('Monitor attempted unexpected network access');
  };
  console.log=value=>{logs.push(String(value));};console.error=value=>{logs.push(String(value));};
  const assert=(condition:unknown,label:string)=>{if (!condition) throw new Error(label);};
  try {
    const {handleMonitorRequest}=await import('./handler.ts');
    const invoke=(key:string|null=secret,method='POST')=>handleMonitorRequest(new Request('https://edge.razemgo.invalid/monitor-push',{
      method,headers:key===null ? {} : {'x-push-dispatch-key':key},...(method==='POST' ? {body:'private-request-body'} : {}),
    }));
    await t.step('unauthorized requests cannot inspect the queue or generate Sentry traffic',async()=>{
      assert((await invoke(null)).status===401,'Anonymous monitor access');
      assert((await invoke('a'.repeat(64))).status===401,'Wrong monitor key');
      assert((await invoke(secret,'GET')).status===405,'Wrong monitor method');
      assert(calls.length===0 && packets.length===0,'Unauthorized side effect');
    });
    await t.step('healthy empty queues produce a safe heartbeat and never call the dispatcher',async()=>{
      const response=await invoke();const result=await response.json();
      assert(response.status===200 && result.healthy && result.heartbeat_accepted,'Heartbeat not accepted');
      assert(packets.length===1 && packets[0].includes('check_in'),'No external check-in');
      const checkIn=JSON.parse(packets[0].trim().split('\n').at(-1)!);
      assert(checkIn.monitor_slug==='razemgo-push-health' && checkIn.status==='ok','Wrong monitor identity');
      assert(checkIn.monitor_config.schedule.value==='*/5 * * * *' && checkIn.environment==='development','Missing schedule');
      assert(!checkIn.contexts && !checkIn.user && !checkIn.request,'Check-in copied scope');
      assert(calls.every(call=>['get_push_health','claim_push_health_alerts'].includes(call.name)),'Monitor called dispatcher');
      assert(!JSON.stringify(result).includes('private'),'Unsafe monitor response');
    });
    await t.step('confirmed incident reports finish their durable lease',async()=>{
      incident=true;
      const response=await invoke();const result=await response.json();
      assert(response.status===200 && !result.healthy && result.reported===1,'Missing incident');
      assert(packets.some(packet=>packet.includes('server.push_health') && packet.includes('PUSH_CREDENTIALS')),'Incident code missing');
      const saved=calls.find(call=>call.name==='finish_push_health_alert');
      assert(saved?.body.accepted===true && saved.body.claim_lease===lease,'Incorrect confirmation');
      incident=false;
    });
    await t.step('proposal incidents reach Sentry with the stable code and confirmed lease',async()=>{
      proposalIncident=true;
      const response=await invoke();const result=await response.json();
      assert(response.status===200 && !result.healthy && result.reported===1,'Missing proposal incident');
      assert(packets.some(packet=>packet.includes('PROPOSAL_QUEUE_STALLED')),'Proposal code was scrubbed');
      assert(calls.some(call=>call.name==='finish_push_health_alert' && call.body.alert_code==='PROPOSAL_QUEUE_STALLED' && call.body.accepted===true),'Proposal lease not confirmed');
      proposalIncident=false;
    });
    await t.step('a missing proposal migration is a failed check-in, never a healthy response',async()=>{
      legacySnapshot=true;
      const response=await invoke();assert(response.status===503,'Missing migration was hidden');
      legacySnapshot=false;
    });
    await t.step('a rejected Sentry heartbeat cannot appear healthy',async()=>{
      sentryStatus=503;
      const response=await invoke();const result=await response.json();
      assert(response.status===503 && !result.ok && !result.heartbeat_accepted,'Rejected heartbeat accepted');
      sentryStatus=200;
    });
    await t.step('snapshot failures generate a failed external heartbeat without leaking the error',async()=>{
      backendFailure=true;
      assert((await invoke()).status===503,'Backend failure was hidden');
      assert(packets.some(packet=>packet.includes('check_in') && packet.includes('"status":"error"')),'No failed heartbeat');
      const all=packets.join('\n')+logs.join('\n');
      for (const value of [secret,'private-server-key','private-request-body','private-db-error','private-snapshot'])
        assert(!all.includes(value),'Private data in monitor diagnostics');
    });
  } finally {
    globalThis.fetch=originalFetch;console.log=originalLog;console.error=originalError;
    for (const [name,value] of previous) {if (value===undefined) Deno.env.delete(name);else Deno.env.set(name,value);}
  }
}});
