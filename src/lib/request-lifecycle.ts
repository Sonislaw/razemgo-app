// Account boundaries are shared by repositories and the SDK transport. No React,
// stored credentials or request contents belong in this module.
export function abortError() {
  return Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
}

export function createRequestLifecycle() {
  let identity: string | null = null;
  let controller = new AbortController();
  return {
    setAccount(next: string | null) {
      if (next === identity) return;
      controller.abort();
      identity = next;
      controller = new AbortController();
    },
    capture() {
      const signal = controller.signal;
      const accountId = identity;
      return {
        accountId,
        signal,
        assertCurrent() {
          if (signal.aborted || accountId !== identity) throw abortError();
        },
      };
    },
  };
}

export const backendLifecycle = createRequestLifecycle();

export function linkedAbortController(
  signals: (AbortSignal | null | undefined)[],
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  }
  return {
    controller,
    dispose: () =>
      signals.forEach((signal) => signal?.removeEventListener('abort', abort)),
  };
}

export function withAccountRequests(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const address =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // Auth owns its own bounded lifecycle, including cleanup before revocation.
    if (!/\/(rest|functions)\/v1\//.test(new URL(address).pathname))
      return fetcher(input, init);
    const account = backendLifecycle.capture();
    const parent =
      init?.signal ??
      (typeof Request !== 'undefined' && input instanceof Request
        ? input.signal
        : undefined);
    const { controller, dispose } = linkedAbortController([
      parent,
      account.signal,
    ]);
    try {
      account.assertCurrent();
      if (controller.signal.aborted) throw abortError();
      const response = await fetcher(input, {
        ...init,
        signal: controller.signal,
      });
      account.assertCurrent();
      return response;
    } finally {
      dispose();
    }
  };
}
