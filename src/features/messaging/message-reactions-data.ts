export const MESSAGE_REACTIONS = [
  { kind: 'love', emoji: '❤️', label: 'Serce' },
  { kind: 'like', emoji: '👍', label: 'Super' },
  { kind: 'laugh', emoji: '😂', label: 'Haha' },
  { kind: 'wow', emoji: '🤩', label: 'Ale fajnie!' },
  { kind: 'hug', emoji: '🤗', label: 'Uściski' },
  { kind: 'thanks', emoji: '🙏', label: 'Dzięki' },
] as const;
export type MessageReactionKind = typeof MESSAGE_REACTIONS[number]['kind'];
export type MessageReactionRow = { message_id: string; kind: MessageReactionKind | null };
export const messageReactionOption = (kind?: MessageReactionKind | null) => MESSAGE_REACTIONS.find(option => option.kind === kind);
export function parseMessageReaction(value: unknown): MessageReactionRow {
  const row = value as MessageReactionRow | null;
  if (!row || typeof row.message_id !== 'string' || row.kind !== null && !messageReactionOption(row.kind)) throw new Error('Invalid message reaction');
  return { message_id: row.message_id, kind: row.kind };
}
