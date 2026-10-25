import type { ProfileAvatarId } from '@/types/avatar';

export const REACTIONS = [
  { kind: 'love', emoji: '❤️', label: 'Podoba mi się' },
  { kind: 'envy', emoji: '🤩', label: 'Zazdroszczę!' },
  { kind: 'curious', emoji: '🧭', label: 'Ciekawy plan' },
  { kind: 'adventure', emoji: '🔥', label: 'Ale przygoda!' },
  { kind: 'applause', emoji: '👏', label: 'Świetny pomysł' },
] as const;
export type ReactionKind = typeof REACTIONS[number]['kind'];
export interface ReactionSummary {
  trip_id: string;
  available: boolean;
  can_react: boolean;
  counts: Partial<Record<ReactionKind, number>>;
  mine: ReactionKind | null;
}
export interface TripReactor {
  id: string; group_id: string; name: string; avatar_id: ProfileAvatarId;
  kind: ReactionKind; updated_at: string; profile_available: boolean;
}
export interface ReactorsPage { items: TripReactor[]; has_more: boolean }
export const reactionOption = (kind: ReactionKind) => REACTIONS.find(option => option.kind === kind)!;
export const reactionTotal = (value?: ReactionSummary) => REACTIONS.reduce((sum, { kind }) => sum + (value?.counts[kind] ?? 0), 0);
export const topReactions = (value: ReactionSummary) => REACTIONS.filter(({ kind }) => (value.counts[kind] ?? 0) > 0)
  .sort((a, b) => (value.counts[b.kind] ?? 0) - (value.counts[a.kind] ?? 0)).slice(0, 3);
export const isReactionKind = (kind: unknown): kind is ReactionKind => REACTIONS.some(option => option.kind === kind);
export function parseReactionSummary(value: unknown): ReactionSummary {
  const data = value as ReactionSummary | null;
  if (!data || typeof data.trip_id !== 'string' || typeof data.available !== 'boolean' || typeof data.can_react !== 'boolean'
    || (data.mine !== null && !isReactionKind(data.mine)) || !data.counts || typeof data.counts !== 'object'
    || Object.entries(data.counts).some(([key, count]) => !isReactionKind(key) || !Number.isSafeInteger(count) || count < 0))
    throw new Error('Invalid reaction summary');
  return data;
}
