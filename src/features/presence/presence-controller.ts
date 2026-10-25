// Framework-independent lifecycle: late replies must never revive a backgrounded
// connection or put the previous account's online state into the current screen.
export const PRESENCE_POLL_MS = 15_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;
export interface PresenceTransport {
  setPresence: (connectionId: string, online: boolean) => Promise<void>;
  getOnline: (groupIds: string[]) => Promise<string[]>;
  newConnection: () => string;
  now?: () => number;
}

export function createPresenceController(ownGroupId: string, transport: PresenceTransport) {
  const watched = new Map<string, number>();
  const listeners = new Set<() => void>();
  let online: ReadonlySet<string> = new Set();
  let connection: string | null = null;
  let revision = 0, pending = false, refreshAgain = false, lastHeartbeat = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const now = transport.now ?? Date.now;
  const publish = (next: ReadonlySet<string>) => {
    if (next.size === online.size && [...next].every(id => online.has(id))) return;
    online = next;
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 100);
  };
  const refresh = async () => {
    if (!connection) return;
    if (pending) { refreshAgain = true; return; }
    const current = revision, id = connection;
    pending = true;
    try {
      if (now() - lastHeartbeat >= PRESENCE_HEARTBEAT_MS) {
        await transport.setPresence(id, true);
        if (current !== revision) return;
        lastHeartbeat = now();
      }
      const ids = [...new Set([ownGroupId, ...watched.keys()])];
      const found = new Set<string>();
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const result = await transport.getOnline(batch);
        if (current !== revision) return;
        for (const groupId of result) if (batch.includes(groupId)) found.add(groupId);
      }
      publish(new Set([...found].filter(id => id === ownGroupId || watched.has(id))));
    } catch {
      // Unknown connectivity is never presented as confirmed online.
      if (current === revision) publish(new Set());
    } finally {
      if (current === revision) {
        pending = false;
        if (refreshAgain) { refreshAgain = false; schedule(); }
      }
    }
  };
  const stop = async () => {
    const previous = connection;
    connection = null; revision++; pending = false; refreshAgain = false;
    clearTimeout(timer);
    publish(new Set());
    if (previous) await transport.setPresence(previous, false).catch(() => undefined);
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => online,
    watch: (id: string) => {
      watched.set(id, (watched.get(id) ?? 0) + 1);
      if (connection) schedule();
      return () => {
        const count = (watched.get(id) ?? 1) - 1;
        if (count > 0) watched.set(id, count); else watched.delete(id);
      };
    },
    start: () => {
      if (connection) return;
      connection = transport.newConnection(); revision++; pending = false; lastHeartbeat = -Infinity;
      void refresh();
    },
    refresh,
    stop,
  };
}
export type PresenceController = ReturnType<typeof createPresenceController>;

let currentStop: (() => Promise<void>) | undefined;
let currentResume: (() => void) | undefined;
export function registerPresenceStop(stop: () => Promise<void>, resume: () => void) {
  currentStop = stop;
  currentResume = resume;
  return () => { if (currentStop === stop) { currentStop = undefined; currentResume = undefined; } };
}
// Called before revoking the JWT, so leaving does not depend on an expired token.
export async function stopCurrentPresence() { await currentStop?.(); }
export function resumeCurrentPresence() { currentResume?.(); }
