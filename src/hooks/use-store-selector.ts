import {
  createSelectionCache,
  selectedSnapshot,
  shallowEqual,
  type SnapshotStore,
} from '@/lib/snapshot-store';
import { useMemo, useState, useSyncExternalStore } from 'react';
export function useStoreSelector<T, S>(
  store: Pick<SnapshotStore<T>, 'getSnapshot' | 'subscribe'>,
  select: (value: T) => S,
  equal = shallowEqual<S>,
) {
  const [cache] = useState(() => createSelectionCache<S>());
  const get = useMemo(
    () => selectedSnapshot(store, select, equal, cache),
    [store, select, equal, cache],
  );
  return useSyncExternalStore(store.subscribe, get, get);
}
