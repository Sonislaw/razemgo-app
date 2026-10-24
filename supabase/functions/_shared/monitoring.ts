import * as Sentry from 'npm:@sentry/deno@10.75.2';
import { classifyFailure, createReportLimiter, sanitizeMonitoringEvent, type ReportContext } from '../../../shared/monitoring-policy.ts';

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

// Only the private dispatcher endpoint can invoke this probe. Never trigger a
// real account operation or claim a push delivery just to verify diagnostics.
export async function sendServerMonitoringTest(requestId:string) {
  if (Deno.env.get('SENTRY_ENVIRONMENT')!=='development' || !enabled)
    return {ok:false as const,reason:'disabled' as const};
  if (!allow('monitoring.test')) return {ok:false as const,reason:'rate_limited' as const};
  const client=Sentry.getClient();
  if (!client) return {ok:false as const,reason:'disabled' as const};
  let eventId:string|undefined;
  let statusCode:number|undefined;
  const unsubscribe=client.on('afterSendEvent',(event,response)=>{
    if (event.event_id===eventId) statusCode=response.statusCode;
  });
  try {
    const context:ReportContext={operation:'monitoring.test',category:'unexpected',code:'UNEXPECTED',requestId};
    eventId=Sentry.captureException(new Error('Backend monitoring test'),{contexts:{monitoring:{...context}}});
    const flushed=await client.flush(5000);
    const accepted=flushed && statusCode!==undefined && statusCode>=200 && statusCode<300;
    console.log(JSON.stringify({event:'monitoring_test',requestId,eventId,accepted,statusCode}));
    return {ok:true as const,eventId,accepted,statusCode:statusCode ?? null};
  } catch {
    return {ok:false as const,reason:'unavailable' as const};
  } finally { unsubscribe(); }
}

export async function reportServerFailure(operation:'server.delete_account'|'server.dispatch_push',error:unknown,requestId:string) {
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
