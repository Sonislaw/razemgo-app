import type {
  MailboxCursor,
  MailboxPageKind,
  MailboxPositions,
  MailboxStates,
} from '@/data/contracts/pages';
import { integer, object, oneOf, text } from '@/data/contracts/validate';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/messaging';
import {
  parseMessageReaction,
  type MessageReactionKind,
  type MessageReactionRow,
} from './message-reactions-data';
import { mailboxFromRow } from './messaging-mapper';

export async function fetchMailbox(
  groupId: string,
  options: {
    kind?: MailboxPageKind;
    cursor?: MailboxCursor;
    conversationId?: string;
    groupId?: string;
    tripId?: string;
    signal?: AbortSignal;
  } = {},
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_my_mailbox_page', {
          page_kind: options.kind ?? 'all',
          before_at: options.cursor?.at ?? null,
          before_id: options.cursor?.id ?? null,
          page_size: 20,
          target_conversation_id: options.conversationId ?? null,
          target_group_id: options.groupId ?? null,
          target_trip_id: options.tripId ?? null,
        })
        .abortSignal(signal),
    'mailbox.load',
    { signal: options.signal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (!data) throw new Error('Missing mailbox');
  const pages = object(data.pages);
  for (const kind of ['conversations', 'received', 'sent']) {
    const page = object(pages[kind]);
    if (typeof page.has_more !== 'boolean' || (page.has_more && !page.cursor))
      throw new Error('Invalid mailbox cursor');
    if (page.cursor) { const cursor = object(page.cursor); text(cursor.id, 128); text(cursor.at, 80); }
  }
  return {
    data: mailboxFromRow(data, groupId),
    pages: data.pages as MailboxPositions,
  };
}
export async function fetchMailboxStates(
  conversations: string[],
  invitations: string[],
) {
  const result: MailboxStates = { conversations: [], invitations: [] };
  for (
    let offset = 0;
    offset < Math.max(conversations.length, invitations.length);
    offset += 100
  ) {
    const { data, error } = await backendRequest(
      (signal) =>
        getSupabase()
          .rpc('get_my_mailbox_states', {
            conversation_ids: conversations.slice(offset, offset + 100),
            invitation_ids: invitations.slice(offset, offset + 100),
          })
          .abortSignal(signal),
      'mailbox.load',
    );
    if (error) throw error;
    if (
      !data ||
      !Array.isArray(data.conversations) ||
      !Array.isArray(data.invitations)
    )
      throw new Error('Invalid mailbox states');
    for (const row of data.conversations) {
      object(row); text(row.id, 128); text(row.updated_at, 80);
      integer(row.unread_count); integer(row.self_read_sequence); integer(row.other_read_sequence);
      if (typeof row.blocked !== 'boolean') throw new Error('Invalid conversation state');
    }
    for (const row of data.invitations) { object(row); text(row.id, 128); oneOf(row.status, ['pending', 'accepted', 'declined', 'withdrawn']); }
    result.conversations.push(...data.conversations);
    result.invitations.push(...data.invitations);
  }
  return result;
}
export async function inviteContact(
  tripId: string,
  text: string,
  requestKey: string,
  sourceTripId?: string,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('send_contact_invitation', {
          target_trip_id: tripId,
          message_text: text.trim(),
          request_key: requestKey,
          source_trip_id: sourceTripId ?? null,
        })
        .abortSignal(signal),
    'invitations.send',
  );
  if (error) throw error;
  return data;
}
export async function respondInvitation(
  id: string,
  response: 'accepted' | 'declined' | 'withdrawn',
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('respond_contact_invitation', { invitation_id: id, response })
        .abortSignal(signal),
    'invitations.respond',
  );
  if (error) throw error;
  return data;
}
export async function inviteProfile(
  groupId: string,
  text: string,
  requestKey: string,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('send_profile_invitation', {
          target_group_id: groupId,
          message_text: text.trim(),
          request_key: requestKey,
        })
        .abortSignal(signal),
    'invitations.send',
  );
  if (error) throw error;
  return data;
}
export async function sendMessage(
  id: string,
  text: string,
  requestKey: string,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('send_chat_message', {
          conversation_id: id,
          message_text: text.trim(),
          request_key: requestKey,
        })
        .abortSignal(signal),
    'messages.send',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing message');
  return data;
}
export async function fetchMessages(
  id: string,
  before?: number,
  parentSignal?: AbortSignal,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_conversation_messages', {
          conversation_id: id,
          before_sequence: before ?? null,
          page_size: 50,
        })
        .abortSignal(signal),
    'messages.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  return data ?? [];
}
export async function persistRead(id: string, throughId: string) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('mark_conversation_read', {
          conversation_id: id,
          through_message_id: throughId,
        })
        .abortSignal(signal),
    'messages.read',
  );
  if (error) throw error;
  return Number(data);
}
export async function fetchMessageReactions(
  conversationId: string,
  messageIds: string[],
  parentSignal?: AbortSignal,
) {
  const ids = [...new Set(messageIds)],
    rows: MessageReactionRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await backendRequest(
      (signal) =>
        getSupabase()
          .rpc('get_message_reactions', {
            conversation_id: conversationId,
            message_ids: batch,
          })
          .abortSignal(signal),
      'messages.reactions.load',
      { signal: parentSignal, read: true, retries: 1 },
    );
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Missing message reactions');
    const parsed = data.map(parseMessageReaction);
    if (
      parsed.length !== batch.length ||
      new Set(parsed.map((row) => row.message_id)).size !== batch.length ||
      parsed.some((row) => !batch.includes(row.message_id))
    )
      throw new Error('Incomplete message reactions');
    rows.push(...parsed);
  }
  return rows;
}
export async function persistMessageReaction(
  messageId: string,
  kind: MessageReactionKind | null,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('set_message_reaction', {
          target_message_id: messageId,
          reaction_kind: kind,
        })
        .abortSignal(signal),
    'messages.reactions.save',
  );
  if (error) throw error;
  const row = parseMessageReaction(data);
  if (row.message_id !== messageId || row.kind !== kind)
    throw new Error('Unexpected message reaction');
  return row;
}
export async function persistBlock(groupId: string, blocked: boolean) {
  const { error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('set_group_block', { target_group_id: groupId, blocked })
        .abortSignal(signal),
    'contacts.block',
  );
  if (error) throw error;
}
export async function persistReport(
  id: string,
  reason: ReportReason,
  requestKey: string,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('report_conversation', {
          conversation_id: id,
          report_reason: reason,
          request_key: requestKey,
        })
        .abortSignal(signal),
    'contacts.report',
  );
  if (error) throw error;
  return data;
}
export function messagingError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '42501')
    return 'Kontakt jest niedostępny. Ekipa mogła zostać zablokowana. Odśwież skrzynkę.';
  if (code === 'P0002')
    return 'Wyjazd lub kontakt jest już niedostępny. Odśwież listę.';
  if (code === '22023')
    return 'Stan zaproszenia się zmienił lub dane są nieprawidłowe. Odśwież skrzynkę.';
  if (code === '54000')
    return 'Wysłano już kilka zaproszeń do tej ekipy. Spróbuj ponownie później.';
  return 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.';
}
