export type SyncReason = 'initial' | 'event' | 'foreground' | 'poll' | 'push';

// One scheduler per account. Realtime, push and foreground events arriving in
// the same burst share work. A change during a request gets one follow-up.
export function createAccountSync(
  isActive: () => boolean,
  readRevision?: () => Promise<string>,
) {
  const jobs = new Map<
    string,
    { run: () => Promise<unknown>; periodic: boolean }
  >();
  const running = new Map<string, Promise<unknown>>();
  const repeat = new Set<string>();
  const failed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let pendingReason: SyncReason = 'initial';
  let revision: string | undefined;
  let checking = false;
  let checkAgain = false;
  let epoch = 0;
  const run = (key: string, changed: boolean) => {
    const job = jobs.get(key);
    if (!job || disposed || !isActive()) return;
    if (running.has(key)) {
      if (changed) repeat.add(key);
      return;
    }
    const runEpoch = epoch;
    const task = Promise.resolve()
      .then(() => {
        if (!disposed && epoch === runEpoch) return job.run();
      })
      .then((result) => {
        if (epoch === runEpoch) {
          if (result === false) failed.add(key);
          else failed.delete(key);
        }
      })
      .catch(() => {
        if (epoch === runEpoch) failed.add(key);
      })
      .finally(() => {
        if (running.get(key) !== task) return;
        running.delete(key);
        if (repeat.delete(key)) run(key, false);
      });
    running.set(key, task);
  };
  const invalidate = (reason: SyncReason = 'event') => {
    if (disposed) return;
    if (pendingReason === 'poll' || reason !== 'poll') pendingReason = reason;
    if (timer) return;
    timer = setTimeout(() => {
      void (async () => {
        timer = undefined;
        if (disposed || !isActive()) return;
        if (checking) {
          checkAgain = true;
          return;
        }
        checking = true;
        const generation = epoch;
        const reason = pendingReason;
        pendingReason = 'poll';
        let unchanged = false;
        try {
          if (readRevision) {
            try {
              const next = await readRevision();
              if (disposed || epoch !== generation || !isActive()) return;
              unchanged = revision === next;
              revision = next;
            } catch {
              /* Let each job expose its normal retryable error state. */
            }
          }
          if (disposed || epoch !== generation || !isActive()) return;
          for (const [key, job] of jobs)
            if (
              (!unchanged || reason === 'initial' || failed.has(key)) &&
              (reason !== 'poll' || job.periodic || failed.has(key))
            )
              run(key, reason === 'event' || reason === 'push');
        } finally {
          if (epoch === generation) {
            checking = false;
            if (checkAgain) {
              checkAgain = false;
              invalidate('event');
            }
          }
        }
      })();
    }, 150);
  };
  return {
    register(key: string, runJob: () => Promise<unknown>, periodic = true) {
      const job = { run: runJob, periodic };
      jobs.set(key, job);
      invalidate('initial');
      return () => {
        if (jobs.get(key) === job) jobs.delete(key);
        repeat.delete(key);
        failed.delete(key);
      };
    },
    invalidate,
    retryOnPoll(key: string) {
      if (!disposed && jobs.has(key)) failed.add(key);
    },
    activate() {
      disposed = false;
      invalidate('initial');
    },
    dispose() {
      disposed = true;
      epoch++;
      checking = false;
      checkAgain = false;
      clearTimeout(timer);
      timer = undefined;
      jobs.clear();
      repeat.clear();
      failed.clear();
      running.clear();
    },
  };
}
