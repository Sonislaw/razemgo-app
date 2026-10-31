// Older installed backends may omit this additive field. Malformed values must
// never enable the cached-prefix fast path.
export function pageRevision(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value))
    throw new Error('Invalid page revision');
  return value;
}
