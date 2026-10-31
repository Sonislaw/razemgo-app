import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPagedResource } from '../src/lib/paged-resource.ts';
import { pageRevision } from '../src/data/contracts/page-revision.ts';
import { mergeRecentEntities } from '../src/lib/bounded-entities.ts';

function fixture(fingerprints = true) {
  let rows = Array.from({ length: 15 }, (_, i) => ({
    id: String((i + 1) * 10).padStart(3, '0'),
  }));
  const calls = [];
  const store = createPagedResource({
    key: (item) => item.id,
    error: () => 'retry',
    load: async (cursor) => {
      calls.push(cursor);
      const eligible = rows.toSorted((a, b) => a.id.localeCompare(b.id));
      const after = eligible.filter((item) => !cursor || item.id > cursor);
      const items = after.slice(0, 5);
      return {
        items,
        totalCount: rows.length,
        hasMore: after.length > 5,
        cursor: items.at(-1)?.id ?? null,
        revision: fingerprints
          ? createHash('md5')
              .update(eligible.map((x) => x.id).join(','))
              .digest('hex')
          : undefined,
      };
    },
    refreshItems: async (items) =>
      rows.filter((row) => items.some((item) => item.id === row.id)),
  });
  return {
    store,
    calls,
    replace: (next) => {
      rows = next;
    },
    rows: () => rows,
  };
}
for (const fingerprints of [true, false])
  test(`insertion between cached pages is never skipped (revision=${fingerprints})`, async () => {
    const f = fixture(fingerprints);
    await f.store.refresh();
    await f.store.more();
    f.replace([...f.rows(), { id: '065' }]);
    await f.store.refresh();
    assert.ok(
      f.store.getSnapshot().page.items.some((x) => x.id === '100'),
      'previous return boundary remains loaded',
    );
    while (f.store.getSnapshot().page.hasMore) await f.store.more();
    assert.equal(f.store.getSnapshot().page.items.length, 16);
    assert.ok(f.store.getSnapshot().page.items.some((x) => x.id === '065'));
  });
test('unchanged fingerprint refreshes cards without reloading earlier pages', async () => {
  const f = fixture();
  await f.store.refresh();
  await f.store.more();
  await f.store.more();
  f.calls.length = 0;
  await f.store.refresh();
  assert.deepEqual(f.calls, [undefined]);
  assert.equal(f.store.getSnapshot().page.items.length, 15);
});
test('renaming/reordering and deleting the cursor reconcile the entire loaded prefix', async () => {
  const f = fixture();
  await f.store.refresh();
  await f.store.more();
  f.replace(
    f
      .rows()
      .filter((x) => x.id !== '100')
      .map((x) => (x.id === '140' ? { id: '055' } : x)),
  );
  await f.store.refresh();
  assert.deepEqual(
    f.store.getSnapshot().page.items.map((x) => x.id),
    ['010', '020', '030', '040', '050', '055', '060', '070', '080', '090'],
  );
  while (f.store.getSnapshot().page.hasMore) await f.store.more();
  assert.equal(f.store.getSnapshot().page.items.length, 14);
});
test('a change during load-more reconciles rather than advancing the old cursor', async () => {
  const f = fixture();
  await f.store.refresh();
  await f.store.more();
  f.replace([...f.rows(), { id: '065' }]);
  await f.store.more();
  assert.equal(f.store.getSnapshot().page.items.length, 15);
  assert.ok(f.store.getSnapshot().page.items.some((x) => x.id === '065'));
  await f.store.more();
  assert.equal(f.store.getSnapshot().page.items.length, 16);
});
test('invalid fingerprints cannot enable cache reuse and recent entities remain bounded', () => {
  assert.equal(pageRevision(undefined), undefined);
  for (const value of [null, 3, 'user-private-data', 'a'.repeat(33)])
    assert.throws(() => pageRevision(value));
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    value: i,
  }));
  const cache = mergeRecentEntities(rows.slice(0, 75), rows.slice(75));
  assert.equal(cache.length, 100);
  assert.equal(cache[0].id, '50');
  assert.equal(
    mergeRecentEntities(cache, [{ id: '50', value: 999 }]).at(-1).value,
    999,
  );
});
