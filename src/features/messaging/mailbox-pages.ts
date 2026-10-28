import type { MailboxStates } from '../../data/contracts/pages';
import { shareRow } from '../../lib/snapshot-store.ts';
import type { MessagingState } from '../../types/messaging';
import type { MailboxData } from './messaging-mapper';

export function mergeMailboxPage(
  state: MessagingState,
  page: MailboxData,
  changes?: MailboxStates,
): MailboxData {
  const conversations = new Map(
    state.conversations.map((item) => [item.id, item]),
  );
  const invitations = new Map(state.invitations.map((item) => [item.id, item]));
  if (changes) {
    const available = new Set(changes.conversations.map((item) => item.id));
    for (const id of conversations.keys())
      if (!available.has(id)) conversations.delete(id);
    const existingInvitations = new Set(
      changes.invitations.map((item) => item.id),
    );
    for (const id of invitations.keys())
      if (!existingInvitations.has(id)) invitations.delete(id);
    for (const row of changes.conversations) {
      const previous = conversations.get(row.id);
      if (previous)
        conversations.set(
          row.id,
          shareRow(previous, {
            ...previous,
            blocked: row.blocked,
            updatedAt: row.updated_at,
            unreadCount: row.unread_count,
            selfReadSequence: Math.max(
              previous.selfReadSequence ?? 0,
              row.self_read_sequence,
            ),
            otherReadSequence: Math.max(
              previous.otherReadSequence ?? 0,
              row.other_read_sequence,
            ),
          }),
        );
    }
    for (const row of changes.invitations) {
      const previous = invitations.get(row.id);
      if (previous)
        invitations.set(
          row.id,
          shareRow(previous, { ...previous, status: row.status }),
        );
    }
  }
  for (const item of page.conversations) {
    const previous = conversations.get(item.id);
    conversations.set(
      item.id,
      shareRow(previous, {
        ...item,
        selfReadSequence: Math.max(
          previous?.selfReadSequence ?? 0,
          item.selfReadSequence ?? 0,
        ),
        otherReadSequence: Math.max(
          previous?.otherReadSequence ?? 0,
          item.otherReadSequence ?? 0,
        ),
      }),
    );
  }
  for (const item of page.invitations)
    invitations.set(item.id, shareRow(invitations.get(item.id), item));
  const contacts = { ...state.contacts },
    trips = { ...state.trips };
  for (const [id, item] of Object.entries(page.contacts))
    contacts[id] = shareRow(contacts[id], item);
  for (const [id, item] of Object.entries(page.trips))
    trips[id] = shareRow(trips[id], item);
  return {
    ...page,
    contacts,
    trips,
    conversations: [...conversations.values()],
    invitations: [...invitations.values()],
  };
}
