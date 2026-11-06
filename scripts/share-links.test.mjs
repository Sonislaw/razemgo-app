import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShareLink, parseShareLink, splitSharedText } from '../src/features/sharing/share-links.ts';

const ID = '00000000-0000-4000-8000-000000000901';
const TRIP = 'razemgo-dev://trip/' + ID;
const CREW = 'razemgo-dev://crew/' + ID;

test('Dev links round-trip both target kinds and normalize UUIDs', () => {
  for (const [kind, link] of [['trip', TRIP], ['group', CREW]]) {
    assert.equal(createShareLink(kind, ID), link);
    assert.deepEqual(parseShareLink(link.toUpperCase()), { kind, id: ID });
  }
  for (const id of ['', '../auth/callback', 'abc', ID + '/edit', undefined, [ID]])
    assert.equal(createShareLink('trip', id), null);
});

test('chat recognizes multiple Dev links with surrounding text and punctuation intact', () => {
  const text = `Zobacz (${TRIP}), a tu ekipa: ${CREW}.\nDo zobaczenia!`;
  const parts = splitSharedText(text);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.target).map(part => part.target), [
    { kind: 'trip', id: ID }, { kind: 'group', id: ID },
  ]);
});

test('chat leaves foreign environments, nested URLs, malformed paths and auth links plain', () => {
  for (const text of ['', 'Zwykła wiadomość', 'razemgo://trip/' + ID,
    'https://example.com/' + TRIP, TRIP + '/edit', TRIP + '?token=x', TRIP + '#auth',
    'razemgo-dev://auth/callback', 'razemgo-dev://evil@trip/' + ID,
    'razemgo-dev://trip:123/' + ID, TRIP + 'a', 'xx' + TRIP,
    'razemgo-dev://trip/%30' + ID.slice(1), 'razemgo-dev://trips/' + ID]) {
    const parts = splitSharedText(text);
    assert.deepEqual(parts, [{ text }]);
    assert.equal(parseShareLink(text), null);
  }
});

test('Preview shares use its own scheme and neither environment opens links from the other backend', () => {
  for (const [kind, path] of [['trip', 'trip'], ['group', 'crew']]) {
    const link = `razemgo://${path}/${ID}`;
    assert.equal(createShareLink(kind, ID, 'razemgo'), link);
    assert.deepEqual(parseShareLink(link.toUpperCase(), 'razemgo'), { kind, id: ID });
    assert.equal(parseShareLink(link, 'razemgo-dev'), null);
    assert.equal(parseShareLink(`razemgo-dev://${path}/${ID}`, 'razemgo'), null);
    assert.deepEqual(splitSharedText(`Zobacz (${link}).`, 'razemgo'), [
      { text: 'Zobacz (' }, { text: link, target: { kind, id: ID } }, { text: ').' },
    ]);
  }
  for (const text of [TRIP, CREW, 'razemgo://auth/callback', `https://example.com/razemgo://trip/${ID}`, `razemgo://trip/${ID}?token=x`])
    assert.deepEqual(splitSharedText(text, 'razemgo'), [{ text }]);
});
