import type { TravelerPassport } from '../../types/passport';

export function createPassportStore(load: (signal: AbortSignal) => Promise<TravelerPassport | null>) {
  type Snapshot = {
    data: TravelerPassport | null;
    status: 'loading' | 'ready' | 'error';
    error: string | null;
    newAward: { id: string; tier: number; count: number; levelUp: boolean } | null;
  };
  let snapshot: Snapshot = { data: null, status: 'loading', error: null, newAward: null };
  const listeners = new Set<() => void>();
  let active = true, generation = 0;
  let controller: AbortController | undefined;
  let pending: Promise<boolean> | undefined;
  const emit = (next: Snapshot) => { snapshot = next; listeners.forEach(fn => fn()); };
  const refresh = () => {
    if (!active) return Promise.resolve(false);
    if (pending) return pending;
    const epoch = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const task = Promise.resolve().then(() => load(signal)).then(data => {
      if (!active || epoch !== generation) return false;
      let newAward = snapshot.newAward;
      if (data?.own && snapshot.data?.own) {
        const gained = data.categories.find(c => c.tier > (snapshot.data?.categories.find(p => p.id === c.id)?.tier ?? 0));
        if (gained) newAward = { id: gained.id, tier: gained.tier,
          count: data.categories.reduce((sum, c) => sum + Math.max(0, c.tier - (snapshot.data?.categories.find(p => p.id === c.id)?.tier ?? 0)), 0),
          levelUp: data.summary.level > snapshot.data.summary.level };
      }
      emit({ data, status: 'ready', error: null, newAward });
      return true;
    }).catch(() => {
      if (active && epoch === generation) emit({ ...snapshot, status: 'error',
        error: 'Nie udało się wczytać paszportu. Sprawdź połączenie i spróbuj ponownie.' });
      return false;
    }).finally(() => { if (pending === task) pending = undefined; });
    pending = task;
    return task;
  };
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => snapshot,
    refresh,
    start: () => { active = true; },
    dismissAward: () => { if (snapshot.newAward) emit({ ...snapshot, newAward: null }); },
    stop: () => { active = false; generation++; controller?.abort(); pending = undefined; },
  };
}
