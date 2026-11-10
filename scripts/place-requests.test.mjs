import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createActivePlaceRequests} from '../src/features/trips/active-place-requests.ts';
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const tick = () => new Promise(resolve => queueMicrotask(resolve));

test('mounted cards, weather, map and description share one lookup; names are released after the last consumer', async () => {
  const pending = deferred(); let calls = 0;
  const requests = createActivePlaceRequests(async () => {calls++; return pending.promise;});
  const values = [];
  const first = requests.subscribe('camp', value => values.push(value));
  const second = requests.subscribe('camp', value => values.push(value));
  const map = requests.read('camp');
  await tick(); assert.equal(calls, 1);
  pending.resolve({name: 'Camping Morski'});
  assert.equal((await map).name, 'Camping Morski'); assert.equal(values.length, 2);
  const next = requests.subscribe('camp', value => values.push(value));
  assert.equal(values.length, 3); assert.equal(calls, 1);
  assert.equal((await requests.read('camp')).name, 'Camping Morski'); assert.equal(calls, 1);
  first(); second(); await tick(); assert.equal(requests.has('camp'), true);
  next(); await tick(); assert.equal(requests.has('camp'), false);
  await requests.read('camp'); assert.equal(calls, 2);
});
test('cancelling one consumer leaves the shared request running; the last release cancels it', async () => {
  const pending = deferred(); let signal;
  const requests = createActivePlaceRequests(async (_id, current) => {signal = current; return pending.promise;});
  const active = requests.subscribe('camp', () => undefined);
  const controller = new AbortController();
  const read = requests.read('camp', controller.signal);
  await tick(); controller.abort(); await assert.rejects(read, {name: 'AbortError'});
  await tick(); assert.equal(signal.aborted, false);
  active(); await tick(); assert.equal(signal.aborted, true); assert.equal(requests.has('camp'), false);
  pending.resolve('late');
});
test('account cleanup discards old responses and synchronous remounts do not duplicate requests', async () => {
  const pending = deferred(); let calls = 0;
  const requests = createActivePlaceRequests(async () => {calls++; return pending.promise;});
  const previous = requests.subscribe('camp', () => assert.fail('Old consumer must not update'));
  previous(); const active = requests.subscribe('camp', () => undefined);
  await tick(); assert.equal(calls, 1);
  requests.clear(); assert.equal(requests.has('camp'), false);
  pending.resolve('old'); await tick(); active();
  const values = []; const next = requests.subscribe('camp', value => values.push(value));
  await requests.read('camp'); assert.equal(calls, 2); assert.deepEqual(values, ['old']);
  next();
});

test('session cache reuses a visited place after all cards unmount and across later detail views', async () => {
  let calls = 0;
  const requests = createActivePlaceRequests(async id => {calls++; return {id, name: 'Camping Morski'};}, {retainedLimit: 100});
  const leaveList = requests.subscribe('camp', () => undefined);
  assert.equal((await requests.read('camp')).name, 'Camping Morski');
  leaveList(); await tick(); assert.equal(requests.has('camp'), true);
  const detailNames = [], leaveDetails = requests.subscribe('camp', value => detailNames.push(value.name));
  assert.deepEqual(detailNames, ['Camping Morski']);
  leaveDetails(); await tick();
  assert.equal((await requests.read('camp')).name, 'Camping Morski'); assert.equal(calls, 1);
  requests.clear(); await requests.read('camp'); assert.equal(calls, 2);
});

test('session cache evicts least recently used inactive places and protects mounted cards', async () => {
  const calls = [];
  const requests = createActivePlaceRequests(async id => {calls.push(id); return id;}, {retainedLimit: 2});
  const release = requests.subscribe('visible', () => undefined); await requests.read('visible');
  await requests.read('a'); await requests.read('b'); await requests.read('a'); await requests.read('c');
  await tick(); assert.equal(requests.has('b'), false); assert.equal(requests.has('a'), true);
  assert.equal(requests.has('visible'), true); assert.deepEqual(calls, ['visible', 'a', 'b', 'c']);
  release(); await tick(); assert.equal(requests.has('visible'), false);
  await requests.read('b'); assert.deepEqual(calls, ['visible', 'a', 'b', 'c', 'b']);
});

test('a selected place seeds session cache while failed and abandoned lookups are never retained', async () => {
  let calls = 0;
  const requests = createActivePlaceRequests(async id => {calls++; if (id === 'failed') throw Error('Offline'); return id;}, {retainedLimit: 2});
  requests.retain('selected', 'Google place name');
  assert.equal(await requests.read('selected'), 'Google place name'); assert.equal(calls, 0);
  await assert.rejects(requests.read('failed'), /Offline/); await tick(); assert.equal(requests.has('failed'), false);
  await assert.rejects(requests.read('failed'), /Offline/); assert.equal(calls, 2);
  const leave = requests.subscribe('abandoned', () => undefined); leave(); await tick();
  assert.equal(requests.has('abandoned'), false);
  requests.clear(); assert.equal(requests.has('selected'), false);
});
