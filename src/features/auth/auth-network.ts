// Auth does not use backendRequest. In particular, signOut otherwise waits for
// an unbounded fetch before the SDK removes the local session.
export const AUTH_REQUEST_TIMEOUT_MS = 10_000;
export const SIGN_OUT_REQUEST_TIMEOUT_MS = 5_000;

export function withAuthRequestTimeout(fetcher: typeof fetch, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(address).pathname;
    if (!path.startsWith('/auth/v1/')) return fetcher(input, init);
    const controller = new AbortController();
    const parent = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort();
    parent?.addEventListener('abort', abort, { once: true });
    if (parent?.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('Authentication request timed out'), { name: 'TimeoutError' }));
      }, path === '/auth/v1/logout' ? Math.min(timeoutMs, SIGN_OUT_REQUEST_TIMEOUT_MS) : timeoutMs);
    });
    try {
      // Race as well as abort: older native transports may ignore cancellation.
      return await Promise.race([fetcher(input, { ...init, signal: controller.signal }), deadline]);
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    }
  };
}

export const SIGN_OUT_CLEANUP_TIMEOUT_MS = 3_000;
export async function cleanUpBeforeSignOut(tasks: ((signal: AbortSignal) => Promise<unknown>)[], timeoutMs = SIGN_OUT_CLEANUP_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); });
  try {
    // Presence, push deregistration and tray cleanup are independent. Failure of
    // one must not prevent the others or keep the account signed in.
    await Promise.race([
      Promise.allSettled(tasks.map(task => Promise.resolve().then(() => task(controller.signal)))),
      deadline,
    ]);
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

interface DeviceAuth {
  admin: { signOut: (token: string, scope: 'local') => Promise<{ error: unknown }> };
  signOut: (options: { scope: 'local' }) => Promise<{ error: unknown }>;
}
interface SessionStorage { removeItem: (key: string) => Promise<void> }

export async function signOutStoredSession(
  auth: DeviceAuth,
  storage: SessionStorage,
  storageKey: string,
  accessToken?: string,
  reportRevokeFailure: (error: unknown) => void = () => undefined,
) {
  if (accessToken) {
    try {
      // This public SDK call uses the user's JWT, never a service-role key.
      // Revoking the captured token avoids getSession's automatic refresh when
      // an expired session is being signed out, especially while offline.
      const result = await auth.admin.signOut(accessToken, 'local');
      if (result.error) reportRevokeFailure(result.error);
    } catch (error) { reportRevokeFailure(error); }
  }
  // Local logout is essential even when remote revocation fails. Storage errors
  // must still reach the UI instead of pretending the device is signed out.
  await storage.removeItem(storageKey);
  // With no stored session the SDK emits SIGNED_OUT and clears its PKCE/user
  // state without making another remote request or refreshing an expired JWT.
  const result = await auth.signOut({ scope: 'local' });
  if (result.error) throw result.error;
}
