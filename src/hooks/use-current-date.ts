import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { todayDate } from '@/features/trips/own-trips-state';

let currentDate = todayDate();
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;

// All visible timelines share one clock and one foreground listener.
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const next = todayDate();
      if (next !== currentDate) { currentDate = next; for (const notify of listeners) notify(); }
      clearTimeout(timer);
      const midnight = new Date(); midnight.setHours(24, 0, 0, 50);
      timer = setTimeout(update, Math.max(100, midnight.getTime() - Date.now()));
    };
    update();
    const native = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    const onVisible = () => { if (document.visibilityState === 'visible') update(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    stop = () => {
      clearTimeout(timer); native.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}
const snapshot = () => currentDate;
const serverSnapshot = () => '';
export function useCurrentDate() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }
