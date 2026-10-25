import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPresenceController, PRESENCE_HEARTBEAT_MS } from '../src/features/presence/presence-controller.ts';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(overrides = {}) {
  const writes = [], reads = [];
  let time = 0, sequence = 0;
  const transport = {
    now: () => time,
    newConnection: () => 'connection-' + ++sequence,
    setPresence: async (id, online) => { writes.push({ id, online }); },
    getOnline: async ids => { reads.push(ids); return ids; },
    ...overrides,
  };
  return { controller: createPresenceController('own', transport), writes, reads,
    advance: ms => { time += ms; }, transport };
}

test('presence: foreground heartbeats, background clearing and independent connections after returning', async () => {
  const f = fixture(); const unwatch = f.controller.watch('other');
  f.controller.start(); await settle();
  assert.deepEqual([...f.controller.getSnapshot()], ['own', 'other']);
  await f.controller.refresh(); assert.equal(f.writes.length, 1);
  f.advance(PRESENCE_HEARTBEAT_MS); await f.controller.refresh(); assert.equal(f.writes.length, 2);
  await f.controller.stop(); assert.equal(f.controller.getSnapshot().size, 0);
  assert.deepEqual(f.writes.at(-1), { id: 'connection-1', online: false });
  f.controller.start(); await settle();
  assert.deepEqual(f.writes.at(-1), { id: 'connection-2', online: true });
  unwatch(); await f.controller.refresh(); assert.deepEqual([...f.controller.getSnapshot()], ['own']);
  await f.controller.stop();
});

test('presence: late old-account responses and delayed heartbeats cannot restore stale online indicators', async () => {
  let resolveOld;
  const f = fixture({ getOnline: () => new Promise(resolve => { resolveOld = resolve; }) });
  f.controller.watch('other'); f.controller.start(); await settle();
  await f.controller.stop(); resolveOld(['own', 'other']); await settle();
  assert.equal(f.controller.getSnapshot().size, 0);
  let resolveHeartbeat;
  const g = fixture({ setPresence: (id, online) => online ? new Promise(resolve => { resolveHeartbeat = resolve; }) : Promise.resolve() });
  g.controller.start(); await g.controller.stop(); resolveHeartbeat(); await settle();
  assert.equal(g.reads.length, 0); assert.equal(g.controller.getSnapshot().size, 0);
});

test('presence: network failure clears online, retries recover, lookup deduplicates avatars and batches at 100', async () => {
  const f = fixture(); const a = f.controller.watch('other'), b = f.controller.watch('other');
  f.controller.start(); await settle(); a(); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().has('other'), true);
  f.transport.getOnline = async () => { throw new Error('Offline'); };
  await f.controller.refresh(); assert.equal(f.controller.getSnapshot().size, 0);
  f.transport.getOnline = async ids => { f.reads.push(ids); return [...ids, 'not-requested']; };
  for (let i = 0; i < 205; i++) f.controller.watch('group-' + i);
  await f.controller.refresh(); assert.equal(f.controller.getSnapshot().size, 207);
  assert.deepEqual(f.reads.slice(-3).map(ids => ids.length), [100, 100, 7]);
  b(); await f.controller.refresh(); assert.equal(f.controller.getSnapshot().has('other'), false);
  await f.controller.stop();
});
