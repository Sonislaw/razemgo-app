export type SharedKind = 'trip' | 'group';
export type SharedTarget = { kind: SharedKind; id: string };
export type SharedTextPart = { text: string; target?: SharedTarget };

const UUID = '[a-f\\d]{8}(?:-[a-f\\d]{4}){3}-[a-f\\d]{12}';
const ID_PATTERN = new RegExp('^' + UUID + '$', 'i');
const LINK_PATTERN = new RegExp('^razemgo-dev://(trip|crew)/(' + UUID + ')$', 'i');

export function createShareLink(kind: SharedKind, id: string): string | null {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  return `razemgo-dev://${kind === 'trip' ? 'trip' : 'crew'}/${id.toLowerCase()}`;
}

export function parseShareLink(text: string): SharedTarget | null {
  const match = LINK_PATTERN.exec(text);
  return match ? { kind: match[1].toLowerCase() === 'trip' ? 'trip' : 'group', id: match[2].toLowerCase() } : null;
}

export function splitSharedText(text: string): SharedTextPart[] {
  const parts: SharedTextPart[] = [];
  let offset = 0;
  // Consume whole URLs so a Dev-looking path inside another site's URL stays plain text.
  for (const match of text.matchAll(/[a-z][a-z\d+.-]*:\/\/[^\s<>"'„”]+/gi)) {
    const candidate = match[0].replace(/[.,!?;:)\]}»…]+$/, '');
    const target = parseShareLink(candidate);
    if (!target) continue;
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    parts.push({ text: candidate, target });
    offset = match.index + candidate.length;
  }
  if (offset < text.length || !parts.length) parts.push({ text: text.slice(offset) });
  return parts;
}
