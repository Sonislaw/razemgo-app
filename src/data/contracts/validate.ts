import type { MailboxRow, MessageRow } from './messaging';
import type { GroupRow, PreferencesRow } from './profile';
import type { PublicTripRow, TripRow } from './trip';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid API object');
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum = 2000): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('Invalid API text');
}
export function integer(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  )
    throw new Error('Invalid API count');
}
export function strings(
  value: unknown,
  maximum = 100,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Invalid API array');
  value.forEach((item) => text(item, 200));
}
export function oneOf(value: unknown, allowed: readonly unknown[]) {
  if (!allowed.includes(value)) throw new Error('Invalid API option');
}
export function parseGroupRow(value: unknown, publicOnly = false): GroupRow {
  const row = object(value);
  text(row.id, 128);
  text(row.name, 40);
  text(row.avatar_id, 64);
  if (!publicOnly) text(row.owner_user_id, 128);
  if (row.crew_number !== undefined) integer(row.crew_number, 100000);
  oneOf(row.kind, ['family', 'couple', 'solo', 'friends']);
  oneOf(row.travel_mode, ['Przyczepa', 'Kamper', 'Namiot', 'Van', 'Samochód']);
  integer(row.adult_count, 1, 8);
  integer(row.child_count, 0, 6);
  strings(row.child_age_bands, 5);
  strings(row.interests, 10);
  strings(row.animal_kinds, 2);
  row.animal_kinds.forEach((kind) => oneOf(kind, ['dog', 'cat']));
  return value as GroupRow;
}
export function parsePreferencesRow(value: unknown): PreferencesRow {
  const row = object(value);
  text(row.group_id, 128);
  text(row.description, 240);
  strings(row.group_kinds, 4);
  strings(row.child_age_bands, 5);
  return value as PreferencesRow;
}
export function parseTripRow(value: unknown): TripRow {
  const row = object(value);
  for (const key of [
    'id',
    'group_id',
    'location_id',
    'location_name',
    'location_region',
  ])
    text(row[key], 200);
  text(row.description, 2000);
  text(row.campground_name, 200);
  text(row.campground_address, 300);
  oneOf(row.mode, ['planned', 'flexible']);
  oneOf(row.status, ['draft', 'published', 'paused', 'completed', 'cancelled']);
  oneOf(row.visibility, ['public', 'private']);
  oneOf(row.landscape, ['coast', 'lake', 'mountain', 'forest']);
  for (const key of ['start_date', 'end_date', 'published_at'])
    if (row[key] !== null) text(row[key], 80);
  for (const key of [
    'interests',
    'animal_kinds',
    'matching_group_kinds',
    'matching_child_age_bands',
  ])
    strings(row[key], 20);
  (row.animal_kinds as string[]).forEach((kind) => oneOf(kind, ['dog', 'cat']));
  return value as TripRow;
}
export function parsePublicTripRow(value: unknown): PublicTripRow {
  const row = object(value);
  parseTripRow(row.trip);
  parseGroupRow(row.crew, true);
  return value as PublicTripRow;
}
export function parseMessageRow(value: unknown): MessageRow {
  const row = object(value);
  for (const key of ['id', 'conversation_id', 'sender_group_id'])
    text(row[key], 128);
  text(row.text, 2000);
  text(row.created_at, 80);
  integer(row.sequence, 1);
  return value as MessageRow;
}
export function parseMailboxRow(value: unknown): MailboxRow {
  const row = object(value);
  for (const key of ['contacts', 'invitations', 'conversations', 'reports']) {
    if (!Array.isArray(row[key])) throw new Error('Invalid mailbox collection');
    (row[key] as unknown[]).forEach(object);
  }
  strings(row.blocked_group_ids, 100000);
  for (const item of row.contacts as unknown[]) {
    const contact = object(item);
    text(contact.id, 128);
    text(contact.name, 40);
    integer(contact.adult_count, 1, 8);
  }
  for (const item of row.invitations as unknown[]) {
    const invitation = object(item);
    for (const key of ['id', 'sender_group_id', 'recipient_group_id'])
      text(invitation[key], 128);
    text(invitation.text, 500);
    oneOf(invitation.status, ['pending', 'accepted', 'declined', 'withdrawn']);
  }
  for (const item of row.conversations as unknown[]) {
    const conversation = object(item);
    for (const key of [
      'id',
      'invitation_id',
      'sender_group_id',
      'recipient_group_id',
    ])
      text(conversation[key], 128);
    integer(conversation.unread_count);
    integer(conversation.self_read_sequence);
    integer(conversation.other_read_sequence);
    if (conversation.last_message !== null)
      parseMessageRow(conversation.last_message);
  }
  return value as MailboxRow;
}
