import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPlaceQueryCache, sameManualAddress} from '../src/features/trips/place-query-cache.ts';

test('predictions reuse normalized queries only within the same session, mode and area scope', () => {
  const cache = createPlaceQueryCache(), rows = [{id: 'camp', name: 'Camping'}];
  cache.set('session-a', ' Camping ', 'planned', false, rows);
  assert.equal(cache.get('session-a', 'camping', 'planned', false), rows);
  assert.equal(cache.get('session-a', 'camping', 'flexible', false), undefined);
  assert.equal(cache.get('session-a', 'camping', 'planned', true), undefined);
  cache.set('session-a', 'absent', 'planned', false, []);
  assert.deepEqual(cache.get('session-a', 'absent', 'planned', false), []);
  assert.equal(cache.get('session-b', 'camping', 'planned', false), undefined);
  assert.equal(cache.get('session-a', 'camping', 'planned', false), undefined);
});
test('prediction memory is bounded and evicts least recently used queries', () => {
  const cache = createPlaceQueryCache(2);
  const set = query => cache.set('session', query, 'planned', false, []);
  const get = query => cache.get('session', query, 'planned', false);
  set('first'); set('second'); get('first'); set('third');
  assert.deepEqual(get('first'), []); assert.equal(get('second'), undefined);
  assert.deepEqual(get('third'), []);
  assert.throws(() => createPlaceQueryCache(0));
});
test('manual names and categories may change without geocoding, but address changes invalidate the known place', () => {
  const original = {source: 'manual', googlePlaceId: 'known-id', name: 'Polana', kind: 'place', address: 'Lesna 4, Ustka', region: 'Pomorskie', country: 'Polska'};
  assert.equal(sameManualAddress(original, {...original, name: 'Nowa nazwa', kind: 'campground'}), true);
  assert.equal(sameManualAddress(original, {...original, address: '  LESNA  4, Ustka ', country: 'polska'}), true);
  for (const field of ['address', 'region', 'country']) {
    assert.equal(sameManualAddress(original, {...original, [field]: 'different'}), false);
    assert.equal(sameManualAddress(original, {...original, [field]: ''}), false);
  }
  assert.equal(sameManualAddress({...original, googlePlaceId: undefined}, original), false);
  assert.equal(sameManualAddress(undefined, original), false);
});
