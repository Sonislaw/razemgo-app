import { reportFailure } from './monitoring-core.ts';
import type { MonitoringOperation } from '../../shared/monitoring-policy.ts';

// A failed connection must produce a retryable state rather than an endless spinner.
export async function backendRequest<T>(operation: (signal: AbortSignal) => PromiseLike<T>, label: MonitoringOperation): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const result = await operation(controller.signal);
    if (result && typeof result === 'object' && 'error' in result && result.error)
      reportFailure(result.error,label,controller.signal.aborted,'status' in result && typeof result.status==='number' ? result.status : undefined);
    return result;
  } catch (error) { reportFailure(error,label,controller.signal.aborted); throw error; }
  finally { clearTimeout(timer); }
}
