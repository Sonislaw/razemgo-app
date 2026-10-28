import type { MonitoringOperation } from '../../shared/monitoring-policy.ts';
import { reportFailure } from './monitoring-core.ts';
import {
  abortError,
  backendLifecycle,
  linkedAbortController,
} from './request-lifecycle.ts';
import {
  recordRequestMetric,
  requestMetricsEnabled,
} from './request-metrics.ts';

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  // Explicit opt-in: mutations are never retried implicitly.
  read?: boolean;
  retries?: 0 | 1;
}
export async function backendRequest<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  label: MonitoringOperation,
  options: RequestOptions = {},
): Promise<T> {
  const account = backendLifecycle.capture();
  const { controller, dispose } = linkedAbortController([
    account.signal,
    options.signal,
  ]);
  const started = Date.now();
  let timedOut = false;
  let failed = false;
  let bytes = 0;
  let rejectAbort: ((reason: Error) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () =>
    rejectAbort?.(
      timedOut
        ? Object.assign(new Error('Request timed out'), {
            name: 'TimeoutError',
          })
        : abortError(),
    );
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 20000);
  try {
    account.assertCurrent();
    if (controller.signal.aborted) throw abortError();
    let result!: T;
    const attempts = options.read && options.retries === 1 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        result = await Promise.race([
          Promise.resolve().then(() => operation(controller.signal)),
          cancelled,
        ]);
      } catch (error) {
        if (
          attempt + 1 < attempts &&
          !controller.signal.aborted &&
          error instanceof TypeError
        )
          continue;
        throw error;
      }
      account.assertCurrent();
      const status =
        result && typeof result === 'object' && 'status' in result
          ? Number(result.status)
          : 0;
      if (attempt + 1 === attempts || status < 500) break;
    }
    if (
      result &&
      typeof result === 'object' &&
      'error' in result &&
      result.error
    ) {
      failed = true;
      reportFailure(
        result.error,
        label,
        timedOut,
        'status' in result && typeof result.status === 'number'
          ? result.status
          : undefined,
      );
    }
    // UTF-8 size of the decoded JSON payload; an approximation of response data,
    // not TLS/compressed wire bytes. No payload is retained or sent to monitoring.
    if (
      requestMetricsEnabled() &&
      result &&
      typeof result === 'object' &&
      'data' in result &&
      result.data != null
    ) {
      try {
        bytes = new TextEncoder().encode(
          JSON.stringify(result.data),
        ).byteLength;
      } catch {
        /* Diagnostics are optional. */
      }
    }
    return result;
  } catch (error) {
    failed = true;
    if (timedOut || !controller.signal.aborted)
      reportFailure(error, label, timedOut);
    throw error;
  } finally {
    clearTimeout(timer);
    dispose();
    controller.signal.removeEventListener('abort', onAbort);
    recordRequestMetric(label, Date.now() - started, bytes, failed);
  }
}
