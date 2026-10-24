import { classifyFailure, createReportLimiter, type MonitoringOperation, type ReportContext } from '../../shared/monitoring-policy.ts';

type Reporter = (error: Error, context: ReportContext) => void;
let reporter: Reporter | undefined;
const allow = createReportLimiter();
// No SDK import here: repositories and this policy remain testable outside React Native.
export function installMonitoringReporter(value: Reporter) { reporter = value; }
export function reportFailure(error: unknown, operation: MonitoringOperation, timedOut = false, httpStatus?: number) {
  if (!reporter) return;
  try {
    const failure=classifyFailure(error,operation,timedOut,httpStatus);
    if (!failure || !allow(operation + ':' + failure.code)) return;
    // A new fixed message also prevents SDK hints/cause chains from holding private errors.
    let requestId: string | undefined;
    if (error && typeof error==='object' && 'context' in error && error.context instanceof Response)
      requestId=error.context.headers.get('x-request-id') ?? undefined;
    reporter(new Error(operation + ': ' + failure.code),{operation,...failure,requestId});
  } catch { /* Reporting must never break a user operation. */ }
}
export async function monitoredOperation<T>(operation: MonitoringOperation, task: () => PromiseLike<T>): Promise<T> {
  try {
    const result=await task();
    if (result && typeof result==='object' && 'error' in result && result.error) reportFailure(result.error,operation);
    return result;
  } catch (error) { reportFailure(error,operation); throw error; }
}
export const monitorAuthRefresh: (fetcher: typeof fetch) => typeof fetch = fetcher => async (input,init) => {
  const refreshing=typeof input==='string' && input.includes('/auth/v1/token?grant_type=refresh_token');
  try {
    const response=await fetcher(input,init);
    if (refreshing && response.status>=500) reportFailure({status:response.status},'auth.restore');
    return response;
  } catch (error) { if (refreshing) reportFailure(error,'auth.restore'); throw error; }
};
