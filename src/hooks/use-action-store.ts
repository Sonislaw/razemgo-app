import { createActionStore } from '@/lib/snapshot-store';
import { useLayoutEffect, useState } from 'react';

export function useActionStore<T extends object>(value: T) {
  const [bridge] = useState(() => createActionStore(value));
  useLayoutEffect(() => {
    bridge.update(value);
  });
  return bridge.store;
}
