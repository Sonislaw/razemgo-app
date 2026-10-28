import ts from 'typescript';

// This annotation describes the PostgREST server, not the database schema.
// Hosted and disposable local stacks can run different server patch versions.
// Keep every table, column, function, relationship and helper type in the check.
export function schemaTypeText(source) {
  const normalized = source
    .replaceAll('\r\n', '\n')
    .replace(
      /(?:^  \/\/[^\n]*\n)*^  __InternalSupabase: \{\n    PostgrestVersion: "[^"\n]+"\n  \}\n/gm,
      '',
    );
  const file = ts.createSourceFile(
    'database.generated.ts',
    normalized,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length)
    throw Error('Generated schema is not valid TypeScript');
  return ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true })
    .printFile(file);
}

export function firstTypeDifference(expected, actual) {
  const before = schemaTypeText(expected).split('\n');
  const after = schemaTypeText(actual).split('\n');
  const line = before.findIndex((value, index) => value !== after[index]);
  if (line === -1 && before.length === after.length) return null;
  const index = line === -1 ? before.length : line;
  return {
    line: index + 1,
    expected: (before[index] ?? '<end>').slice(0, 240),
    actual: (after[index] ?? '<end>').slice(0, 240),
  };
}
