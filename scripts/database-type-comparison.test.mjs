import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  schemaTypeText,
  firstTypeDifference,
} from './database-type-comparison.mjs';

const body =
  '  public: { Tables: { profiles: { Row: { name: string } } } }\n}\n';
const generated = (version) =>
  'export type Database = {\n' +
  '  // Allows to automatically instantiate createClient with right options\n' +
  "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)\n" +
  '  __InternalSupabase: {\n    PostgrestVersion: "' +
  version +
  '"\n  }\n' +
  body;

test('schema comparison ignores only server-version metadata and line endings', () => {
  assert.equal(
    firstTypeDifference(
      generated('14.18'),
      generated('14.17').replaceAll('\n', '\r\n'),
    ),
    null,
  );
  assert.equal(
    schemaTypeText(generated('14.18')),
    schemaTypeText('export type Database = {\n' + body),
  );
  assert.equal(
    firstTypeDifference(
      generated('14.18'),
      'export type Database = {\n' + body,
    ),
    null,
  );
});
test('schema comparison still detects changed columns and removed schema lines', () => {
  assert.ok(
    firstTypeDifference(
      generated('14.18'),
      generated('14.18').replace('name: string', 'name: number'),
    ),
  );
  assert.ok(
    firstTypeDifference(
      generated('14.18'),
      generated('14.18').replace(body, '}\n'),
    ),
  );
});
test('unknown internal annotations are not silently removed', () => {
  const unknown = generated('14.18').replace(
    '    PostgrestVersion: "14.18"',
    '    UnknownContract: "changed"',
  );
  assert.ok(firstTypeDifference(generated('14.18'), unknown));
});

test('formatting normalization preserves identity and JSON nullability contracts', () => {
  const types =
    'export type Database = { Row: { value: NonNullable<Json> }; Insert: { sequence?: never } };';
  assert.equal(firstTypeDifference(types, types.replaceAll('; ', ';\n')), null);
  assert.ok(
    firstTypeDifference(types, types.replace('NonNullable<Json>', 'Json')),
  );
  assert.ok(
    firstTypeDifference(
      types,
      types.replace('sequence?: never', 'sequence?: number'),
    ),
  );
});
