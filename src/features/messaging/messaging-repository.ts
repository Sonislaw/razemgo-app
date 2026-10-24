import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/messaging';
import { mailboxFromRow } from './messaging-mapper';

export async function fetchMailbox(groupId: string) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_mailbox').abortSignal(signal), 'mailbox.load');
  if (error) throw error;
  if (!data) throw new Error('Missing mailbox');
  return mailboxFromRow(data, groupId);
}
export async function inviteContact(tripId: string, text: string, requestKey: string, sourceTripId?: string) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('send_contact_invitation', {
    target_trip_id: tripId, message_text: text.trim(), request_key: requestKey, source_trip_id: sourceTripId ?? null,
  }).abortSignal(signal), 'invitations.send');
  if (error) throw error;
  return data;
}
export async function respondInvitation(id: string, response: 'accepted' | 'declined' | 'withdrawn') {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('respond_contact_invitation', { invitation_id: id, response }).abortSignal(signal), 'invitations.respond');
  if (error) throw error;
  return data;
}
export async function sendMessage(id: string, text: string, requestKey: string) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('send_chat_message', { conversation_id: id, message_text: text.trim(), request_key: requestKey }).abortSignal(signal), 'messages.send');
  if (error) throw error;
  if (!data) throw new Error('Missing message');
  return data;
}
export async function fetchMessages(id: string, before?: number) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_conversation_messages', { conversation_id: id, before_sequence: before ?? null, page_size: 50 }).abortSignal(signal), 'messages.load');
  if (error) throw error;
  return data ?? [];
}
export async function persistRead(id: string, throughId: string) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('mark_conversation_read', { conversation_id: id, through_message_id: throughId }).abortSignal(signal), 'messages.read');
  if (error) throw error;
  return Number(data);
}
export async function persistBlock(groupId: string, blocked: boolean) {
  const { error } = await backendRequest(signal => getSupabase().rpc('set_group_block', { target_group_id: groupId, blocked }).abortSignal(signal), 'contacts.block');
  if (error) throw error;
}
export async function persistReport(id: string, reason: ReportReason, requestKey: string) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('report_conversation', { conversation_id: id, report_reason: reason, request_key: requestKey }).abortSignal(signal), 'contacts.report');
  if (error) throw error;
  return data;
}
export function messagingError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '42501') return 'Kontakt jest niedostępny. Ekipa mogła zostać zablokowana. Odśwież skrzynkę.';
  if (code === 'P0002') return 'Wyjazd lub kontakt jest już niedostępny. Odśwież listę.';
  if (code === '22023') return 'Stan zaproszenia się zmienił lub dane są nieprawidłowe. Odśwież skrzynkę.';
  if (code === '54000') return 'Wysłano już kilka zaproszeń do tej ekipy. Spróbuj ponownie później.';
  return 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.';
}
