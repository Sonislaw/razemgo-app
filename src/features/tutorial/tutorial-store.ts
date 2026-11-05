export type TutorialDecision = 'skipped' | 'completed';
export type TutorialState = { loaded: boolean; status: TutorialDecision | null; pending: boolean };
type Cache = { status: TutorialDecision; pending: boolean };
export function parseTutorialState(value: unknown): TutorialDecision | null {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('status' in value)
    || (value.status !== null && value.status !== 'skipped' && value.status !== 'completed')) throw Error('Invalid tutorial state');
  return value.status as TutorialDecision | null;
}

export function createTutorialStore(deps: {
  readCache: () => Promise<string | null>;
  writeCache: (value: string) => Promise<void>;
  load: () => Promise<TutorialDecision | null>;
  save: (status: TutorialDecision) => Promise<TutorialDecision>;
}) {
  let state: TutorialState = { loaded: false, status: null, pending: false };
  let alive = true, cacheRead = false, revision = 0;
  let running: Promise<boolean> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const update = (patch: Partial<TutorialState>) => {
    if (!alive) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const cache = () => {
    if (!state.status) return;
    const value = JSON.stringify({ status: state.status, pending: state.pending } satisfies Cache);
    writes = writes.then(() => deps.writeCache(value)).catch(() => { /* Remote state remains authoritative. */ });
  };
  const synchronize = (): Promise<boolean> => {
    if (!alive) return Promise.resolve(true);
    if (running) return running;
    running = (async () => {
      try {
        if (!cacheRead) {
          const before = revision;
          const raw = await deps.readCache().catch(() => null);
          cacheRead = true;
          if (!alive) return true;
          if (before === revision && raw) {
            try {
              const value = JSON.parse(raw);
              if (['skipped', 'completed'].includes(value.status) && typeof value.pending === 'boolean')
                update({ loaded: true, status: value.status, pending: value.pending });
            } catch { /* An invalid cache is recovered from the account. */ }
          }
        }
        if (!alive) return true;
        if (!state.pending && (!state.loaded || state.status === null)) {
          const before = revision;
          const decision = await deps.load();
          if (!alive) return true;
          if (before === revision) {
            update({ loaded: true, status: decision });
            cache();
          }
        }
        while (alive && state.pending && state.status) {
          const before = revision;
          const decision = await deps.save(state.status);
          if (!alive) return true;
          if (before === revision) {
            update({ loaded: true, status: decision, pending: false });
            cache();
          }
        }
        await writes;
        return true;
      } catch { return false; }
      finally { running = undefined; }
    })();
    return running;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    synchronize,
    finish(decision: TutorialDecision) {
      revision++;
      update({ loaded: true, status: state.status === 'completed' ? 'completed' : decision, pending: true });
      cache();
      void synchronize();
    },
    stop() { alive = false; listeners.clear(); },
  };
}
