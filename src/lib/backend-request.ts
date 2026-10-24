// A failed connection must produce a retryable state rather than an endless spinner.
export async function backendRequest<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try { return await operation(controller.signal); }
  finally { clearTimeout(timer); }
}
