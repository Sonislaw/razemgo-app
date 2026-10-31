import { useCallback, useRef, useState, type RefObject } from 'react';
import { USE_DEMO_DATA } from '@/constants/app';
import type { MessagingState } from '@/types/messaging';
import type { MessageReactionKind } from './message-reactions-data';
import { canSendToConversation } from './messaging-state';
import * as repository from './messaging-repository';

// Versioned loads and pending writes are scoped to this account's provider.
// A stale reaction read must never overwrite a newer confirmed choice.
export function useMessageReactions(
  ready: boolean,
  alive: RefObject<boolean>,
  current: RefObject<MessagingState>,
) {
  const [messageReactions, setMessageReactions] = useState<
    Record<string, MessageReactionKind | null>
  >({});
  const [messageReactionErrors, setMessageReactionErrors] = useState<
    Record<string, string | null>
  >({});
  const reactionVersions = useRef(new Map<string, number>());
  const reactionLoads = useRef(new Map<string, number>());
  const pendingReactions = useRef(new Set<string>());

  const reloadMessageReactions = useCallback(
    async (id: string, messageIds?: string[], signal?: AbortSignal) => {
      if (USE_DEMO_DATA) return true;
      if (!ready || !alive.current) return false;
      const ids =
        messageIds ??
        current.current.messages
          .filter((m) => m.conversationId === id && m.sequence !== undefined)
          .map((m) => m.id);
      if (!ids.length) return true;
      const load = (reactionLoads.current.get(id) ?? 0) + 1;
      reactionLoads.current.set(id, load);
      const versions = new Map(
        ids.map((messageId) => [
          messageId,
          reactionVersions.current.get(messageId) ?? 0,
        ]),
      );
      try {
        const rows = await repository.fetchMessageReactions(id, ids, signal);
        if (
          !alive.current ||
          signal?.aborted ||
          reactionLoads.current.get(id) !== load
        )
          return false;
        setMessageReactions((previous) => ({
          ...previous,
          ...Object.fromEntries(
            rows
              .filter(
                (row) =>
                  !pendingReactions.current.has(row.message_id) &&
                  (reactionVersions.current.get(row.message_id) ?? 0) ===
                    versions.get(row.message_id),
              )
              .map((row) => [row.message_id, row.kind]),
          ),
        }));
        setMessageReactionErrors((previous) => ({ ...previous, [id]: null }));
        return true;
      } catch {
        if (
          alive.current &&
          !signal?.aborted &&
          reactionLoads.current.get(id) === load
        )
          setMessageReactionErrors((previous) => ({
            ...previous,
            [id]: 'Nie udało się wczytać reakcji. Spróbuj ponownie.',
          }));
        return false;
      }
    },
    [ready, alive, current],
  );

  const reactToMessage = useCallback(
    async (messageId: string, kind: MessageReactionKind | null) => {
      const message = current.current.messages.find((m) => m.id === messageId);
      if (
        !alive.current ||
        !message ||
        message.sender !== 'other' ||
        message.status !== 'sent' ||
        !canSendToConversation(current.current, message.conversationId) ||
        pendingReactions.current.has(messageId)
      )
        throw new Error('Message unavailable');
      pendingReactions.current.add(messageId);
      reactionVersions.current.set(
        messageId,
        (reactionVersions.current.get(messageId) ?? 0) + 1,
      );
      try {
        if (!USE_DEMO_DATA) {
          if (!ready) throw new Error('Session unavailable');
          await repository.persistMessageReaction(messageId, kind);
        }
        if (alive.current)
          setMessageReactions((previous) => ({
            ...previous,
            [messageId]: kind,
          }));
      } finally {
        pendingReactions.current.delete(messageId);
        reactionVersions.current.set(
          messageId,
          (reactionVersions.current.get(messageId) ?? 0) + 1,
        );
        // Also reconcile a write whose response was lost. Repeating the same choice
        // is an idempotent set, not a toggle that could accidentally undo it.
        if (alive.current) void reloadMessageReactions(message.conversationId);
      }
    },
    [ready, reloadMessageReactions, alive, current],
  );

  const pruneMessageReactions = useCallback(
    (keep: Set<string>, incomingIds: string[]) => {
      const retainedMessages = new Set([
        ...current.current.messages
          .filter((m) => keep.has(m.conversationId))
          .map((m) => m.id),
        ...incomingIds,
        ...pendingReactions.current,
      ]);
      setMessageReactions((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => retainedMessages.has(key)),
        ),
      );
      setMessageReactionErrors((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => keep.has(key)),
        ),
      );
      for (const key of reactionVersions.current.keys())
        if (!retainedMessages.has(key)) reactionVersions.current.delete(key);
      for (const key of reactionLoads.current.keys())
        if (!keep.has(key)) reactionLoads.current.delete(key);
    },
    [current],
  );
  return {
    messageReactions,
    messageReactionErrors,
    reloadMessageReactions,
    reactToMessage,
    pruneMessageReactions,
  };
}
