import * as Sentry from 'npm:@sentry/deno@10.75.2';
import { classifyFailure, createReportLimiter, sanitizeMonitoringEvent, PUSH_HEALTH_CODES, type PushHealthCode, type ReportContext } from '../../../shared/monitoring-policy.ts';

const dsn=Deno.env.get('SENTRY_DSN')?.trim();
let enabled=false;
const allow=createReportLimiter();
const metadata={release:'razemgo-edge@' + (Deno.env.get('SENTRY_RELEASE') ?? 'development'),
  environment:Deno.env.get('SENTRY_ENVIRONMENT')==='production' ? 'production' : 'development', platform:'deno' as const};
try {
  if (dsn) {
    Sentry.init({dsn,defaultIntegrations:false,sendDefaultPii:false,sendClientReports:false,
      enableLogs:false,tracesSampleRate:0,debug:false,
      beforeSend(event,hint) {
        hint.attachments=[];
        return sanitizeMonitoringEvent(event,metadata,(event.contexts?.monitoring ?? {}) as ReportContext);
      },
    });
    enabled=true;
  }
} catch { /* A bad diagnostic configuration cannot prevent an Edge Function from starting. */ }

async function captureConfirmed(context:ReportContext) {
  const client=Sentry.getClient();
  if (!enabled || !client) return {accepted:false,statusCode:null,eventId:null};
  let eventId:string|undefined;
  let statusCode:number|undefined;
  const unsubscribe=client.on('afterSendEvent',(event,response)=>{
    if (event.event_id===eventId) statusCode=response.statusCode;
  });
  try {
    eventId=Sentry.captureException(new Error(context.operation+':'+context.code),{contexts:{monitoring:{...context}}});
    const flushed=await client.flush(5000);
    const accepted=flushed && statusCode!==undefined && statusCode>=200 && statusCode<300;
    return {eventId,accepted,statusCode:statusCode ?? null};
  } catch {
    return {accepted:false,statusCode:null,eventId:null};
  } finally { unsubscribe(); }
}

// Only the private dispatcher endpoint can invoke this development probe.
export async function sendServerMonitoringTest(requestId:string) {
  if (Deno.env.get('SENTRY_ENVIRONMENT')!=='development' || !enabled)
    return {ok:false as const,reason:'disabled' as const};
  if (!allow('monitoring.test')) return {ok:false as const,reason:'rate_limited' as const};
  const result=await captureConfirmed({operation:'monitoring.test',category:'unexpected',code:'UNEXPECTED',requestId});
  console.log(JSON.stringify({event:'monitoring_test',requestId,...result}));
  return {ok:true as const,...result};
}

export async function reportPushHealthAlert(code:PushHealthCode,requestId:string) {
  if (!PUSH_HEALTH_CODES.includes(code)) return {accepted:false,statusCode:null,eventId:null};
  const result=await captureConfirmed({operation:'server.push_health',category:'server',code,requestId});
  console.error(JSON.stringify({event:'push_health_alert',code,requestId,...result}));
  return result;
}

// Explicit, content-free check-in envelope: no scope/user/trace/request context.
// Use the SDK transport directly so a flushed but rejected check-in is not
// mistaken for successful monitoring. Sentry creates the monitor on first use.
export async function sendPushMonitorHeartbeat(success:boolean) {
  const client=Sentry.getClient();
  if (!enabled || !client) return {accepted:false,statusCode:null};
  const checkInId=crypto.randomUUID().replaceAll('-','');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const response=await Promise.race([
      Promise.resolve(client.sendEnvelope([{},[[{type:'check_in'},{
        check_in_id:checkInId,monitor_slug:'razemgo-push-health',status:success ? 'ok' : 'error',
        release:metadata.release,environment:metadata.environment,
        monitor_config:{schedule:{type:'crontab',value:'*/5 * * * *'},checkin_margin:5,max_runtime:1,
          timezone:'Etc/UTC',failure_issue_threshold:2,recovery_threshold:1},
      }]]])),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Check-in timeout')),5000);}),
    ]);
    const statusCode=response.statusCode ?? null;
    return {accepted:statusCode!==null && statusCode>=200 && statusCode<300,statusCode};
  } catch { return {accepted:false,statusCode:null}; }
  finally {if (timer!==undefined) clearTimeout(timer);}
}

export async function reportServerFailure(operation:'server.delete_account'|'server.dispatch_push'|'server.push_health',error:unknown,requestId:string) {
  try {
    const failure=classifyFailure(error,operation);
    if (!failure || !allow(operation+':'+failure.code)) return;
    const context:ReportContext={operation,...failure,requestId};
    // This structured log is useful in Supabase even before Sentry is configured.
    console.error(JSON.stringify({event:'operation_failed',...context}));
    if (!enabled) return;
    // Keep original code frames for exceptions; beforeSend removes messages and arbitrary fields.
    Sentry.captureException(error instanceof Error ? error : new Error(operation+':'+failure.code),{contexts:{monitoring:{...context}}});
    await Sentry.flush(1500);
  } catch { /* Monitoring cannot change the function's response. */ }
}
