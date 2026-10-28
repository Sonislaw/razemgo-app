import { USE_DEMO_DATA } from '@/constants/app';
import type { MailboxPageKind, MailboxPositions } from '@/data/contracts/pages';
import { demoMailbox, demoProposals } from '@/data/demo-adapter';
import {
  useAccountSummary,
  useAccountSync,
  useAccountSyncJob,
  useAccountSyncStatus,
} from '@/features/auth/account-sync-context';
import { useAuth } from '@/features/auth/auth-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { DEMO_PUBLIC_GROUPS } from '@/features/groups/group-demo';
import { useProfile } from '@/features/profile/profile-context';
import { useActionStore } from '@/hooks/use-action-store';
import { useStoreSelector } from '@/hooks/use-store-selector';
import { createRequestKey } from '@/lib/request-key';
import type { SnapshotStore } from '@/lib/snapshot-store';
import type {
  MessagingContact,
  MessagingState,
  ReportReason,
} from '@/types/messaging';
import type { TripPlan } from '@/types/travel';
import { usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { mergeMailboxPage } from './mailbox-pages';
import type { MessageReactionKind } from './message-reactions-data';
import { messageFromRow } from './messaging-mapper';
import * as repository from './messaging-repository';
import {
  canSendToConversation,
  createMessagingState,
  isConversationAccepted,
  messagingReducer,
  unreadCount,
  type MessagingAction,
} from './messaging-state';

type HistoryStatus = {
  loaded: boolean;
  loading: boolean;
  requestPending?: boolean;
  hasMore: boolean;
  error: string | null;
};
interface MessagingContextValue {
  state: MessagingState;
  dispatch: Dispatch<MessagingAction>;
  error: string | null;
  actionError: string | null;
  hasLoaded: boolean;
  loadMoreMailbox: () => Promise<void>;
  loadingMoreMailbox: boolean;
  busy: boolean;
  realtime: 'connecting' | 'live' | 'reconnecting';
  histories: Record<string, HistoryStatus>;
  messageReactions: Record<string, MessageReactionKind | null>;
  messageReactionErrors: Record<string, string | null>;
  reloadMessageReactions: (
    id: string,
    messageIds?: string[],
  ) => Promise<boolean>;
  reactToMessage: (
    messageId: string,
    kind: MessageReactionKind | null,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  loadHistory: (id: string, older?: boolean) => Promise<void>;
  invite: (
    tripId: string,
    text: string,
    key: string,
    sourceId?: string,
  ) => Promise<boolean>;
  inviteProfile: (
    groupId: string,
    text: string,
    key: string,
  ) => Promise<boolean>;
  respond: (
    id: string,
    response: 'accepted' | 'declined' | 'withdrawn',
  ) => Promise<string | null | false>;
  send: (id: string, text: string, requestKey?: string) => Promise<void>;
  markRead: (id: string, throughId: string) => Promise<void>;
  setBlock: (groupId: string, blocked: boolean) => Promise<boolean>;
  report: (id: string, reason: ReportReason, key: string) => Promise<boolean>;
  contact: (id: string) => MessagingContact | undefined;
  trip: (id: string | null) => TripPlan | undefined;
}
const MessagingContext =
  createContext<SnapshotStore<MessagingContextValue> | null>(null);
export function MessagingProvider({ children }: { children: ReactNode }) {
  const [state, reduce] = useReducer(messagingReducer, undefined, () =>
    createMessagingState(
      USE_DEMO_DATA
        ? demoMailbox()
        : {
            invitations: [],
            acceptedInvitations: [],
            conversations: [],
            messages: [],
          },
      USE_DEMO_DATA ? 'initial' : 'empty',
    ),
  );
  const { session } = useAuth();
  const { profile, hasProfile, status: profileStatus } = useProfile();
  const { refresh: refreshDiscovery } = useDiscovery();
  const groupId = profile.group.id;
  const userId = session?.user.id;
  const ready = !!userId && hasProfile && profileStatus === 'ready';
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(USE_DEMO_DATA);
  const [busy, setBusy] = useState(false);
  const realtime = useAccountSyncStatus();
  const accountSync = useAccountSync();
  const summary = useAccountSummary();
  const pathname = usePathname();
  const activeConversation = useRef<string | undefined>(undefined);
  const historyRequests = useRef(new Map<string, AbortController>());
  useEffect(() => {
    activeConversation.current = /^\/chat\/([^/]+)$/.exec(pathname)?.[1];
    for (const [id, request] of historyRequests.current)
      if (id !== activeConversation.current) request.abort();
  }, [pathname]);
  const [histories, setHistories] = useState<Record<string, HistoryStatus>>({});
  const [messageReactions, setMessageReactions] = useState<
    Record<string, MessageReactionKind | null>
  >({});
  const [messageReactionErrors, setMessageReactionErrors] = useState<
    Record<string, string | null>
  >({});
  const reactionVersions = useRef(new Map<string, number>());
  const reactionLoads = useRef(new Map<string, number>());
  const pendingReactions = useRef(new Set<string>());
  const current = useRef(state);
  const historiesRef = useRef(histories);
  const loaded = useRef(USE_DEMO_DATA);
  const lastRefreshSucceeded = useRef(false);
  const historyFailures = useRef(new Set<string>());
  const alive = useRef(true);
  const fetching = useRef<Promise<void> | null>(null);
  const refreshAgain = useRef(false);
  const historyCursor = useRef(new Map<string, number>());
  const activeHistories = useRef(new Set<string>());
  const historyCompletions = useRef(
    new Map<string, { done: Promise<void>; signal: AbortSignal }>(),
  );
  const queuedOlder = useRef(new Map<string, Promise<void>>());
  const pendingActions = useRef(new Set<string>());
  const reading = useRef(new Set<string>());
  const positions = useRef<MailboxPositions | null>(null);
  const contextPositions = useRef(new Map<string, MailboxPositions>());
  const [loadingMoreMailbox, setLoadingMoreMailbox] = useState(false);
  const morePending = useRef(false);
  const moreRequest = useRef<Promise<void> | null>(null);
  const historyLru = useRef<string[]>([]);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    historiesRef.current = histories;
  }, [histories]);
  useEffect(() => {
    alive.current = true;
    const requests = historyRequests.current;
    return () => {
      alive.current = false;
      for (const request of requests.values()) request.abort();
      requests.clear();
    };
  }, []);
  useEffect(() => {
    if (summary)
      reduce({
        type: 'summary',
        unreadMessages: summary.unread_messages,
        pendingInvitations: summary.pending_invitations,
      });
  }, [summary]);
  // Navigation actions remain local; demo mutations never handle real accounts.
  const dispatch = useCallback<Dispatch<MessagingAction>>((action) => {
    if (USE_DEMO_DATA || action.type === 'view') reduce(action);
  }, []);
  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA) {
      reduce({ type: 'ready' });
      return;
    }
    if (!ready || !alive.current) return;
    if (fetching.current) {
      refreshAgain.current = true;
      return fetching.current;
    }
    if (!loaded.current) reduce({ type: 'load-status', status: 'loading' });
    const pending = (async () => {
      try {
        if (moreRequest.current) await moreRequest.current;
        do {
          refreshAgain.current = false;
          const previous = current.current;
          const [page, changes] = await Promise.all([
            repository.fetchMailbox(groupId),
            loaded.current
              ? repository.fetchMailboxStates(
                  previous.conversations.map((c) => c.id),
                  previous.invitations.map((i) => i.id),
                )
              : Promise.resolve(undefined),
          ]);
          let data = mergeMailboxPage(previous, page.data, changes);
          const context = /^\/(chat|crew|trip|trips)\/([^/]+)$/.exec(pathname);
          if (context && /^[a-f\d-]{36}$/i.test(context[2])) {
            const extra = await repository.fetchMailbox(
              groupId,
              context[1] === 'chat'
                ? { conversationId: context[2] }
                : context[1] === 'crew'
                  ? { groupId: context[2] }
                  : { tripId: context[2] },
            );
            data = mergeMailboxPage({ ...previous, ...data }, extra.data);
            const key = context[1] + '/' + context[2],
              prior = contextPositions.current.get(key);
            if (!prior) contextPositions.current.set(key, extra.pages);
            else
              for (const kind of [
                'conversations',
                'received',
                'sent',
              ] as const) {
                if (
                  !prior[kind].cursor ||
                  prior[kind].cursor?.id === extra.pages[kind].cursor?.id
                )
                  prior[kind] = extra.pages[kind];
              }
          }
          if (!alive.current) return;
          if (!positions.current) positions.current = page.pages;
          else
            for (const kind of ['conversations', 'received', 'sent'] as const) {
              if (
                !positions.current[kind].cursor ||
                positions.current[kind].cursor?.id ===
                  page.pages[kind].cursor?.id
              )
                positions.current[kind] = page.pages[kind];
            }
          current.current = messagingReducer(current.current, {
            type: 'hydrate',
            data,
          });
          reduce({ type: 'hydrate', data });
          setHistories((previous) => {
            const entries = Object.entries(previous).filter(([id]) =>
              data.conversations.some((c) => c.id === id),
            );
            if (entries.length === Object.keys(previous).length)
              return previous;
            return Object.fromEntries(entries);
          });
          for (const id of historyCursor.current.keys())
            if (!data.conversations.some((c) => c.id === id))
              historyCursor.current.delete(id);
          loaded.current = true;
          setHasLoaded(true);
          setError(null);
          lastRefreshSucceeded.current = true;
        } while (refreshAgain.current);
      } catch {
        if (!alive.current) return;
        lastRefreshSucceeded.current = false;
        accountSync?.retryOnPoll('mailbox');
        if (!loaded.current) reduce({ type: 'load-status', status: 'error' });
        setError(
          'Nie udało się odświeżyć skrzynki. Sprawdź połączenie i spróbuj ponownie.',
        );
      } finally {
        fetching.current = null;
      }
    })();
    fetching.current = pending;
    return pending;
  }, [groupId, ready, pathname, accountSync]);
  const loadMoreMailbox = useCallback(async () => {
    if (fetching.current) await fetching.current;
    const context = /^\/(crew|trip|trips)\/([^/]+)$/.exec(pathname);
    const scope = context
      ? contextPositions.current.get(context[1] + '/' + context[2])
      : positions.current;
    const kind: MailboxPageKind = context
      ? ((['conversations', 'received', 'sent'] as const).find(
          (kind) => scope?.[kind].has_more,
        ) ?? 'conversations')
      : current.current.view === 'conversations'
        ? 'conversations'
        : current.current.direction;
    const position = scope?.[kind];
    if (
      USE_DEMO_DATA ||
      !ready ||
      !position?.has_more ||
      !position.cursor ||
      morePending.current
    )
      return;
    morePending.current = true;
    setLoadingMoreMailbox(true);
    const pending = (async () => {
      try {
        const page = await repository.fetchMailbox(groupId, {
          kind,
          cursor: position.cursor!,
          ...(context
            ? context[1] === 'crew'
              ? { groupId: context[2] }
              : { tripId: context[2] }
            : {}),
        });
        if (!alive.current) return;
        const data = mergeMailboxPage(current.current, page.data);
        current.current = messagingReducer(current.current, {
          type: 'hydrate',
          data,
        });
        reduce({ type: 'hydrate', data });
        const nextPosition = { ...scope!, [kind]: page.pages[kind] };
        if (context)
          contextPositions.current.set(
            context[1] + '/' + context[2],
            nextPosition,
          );
        else positions.current = nextPosition;
        setActionError(null);
      } catch {
        if (alive.current)
          setActionError(
            'Nie udało się pobrać kolejnej części skrzynki. Przewiń lub odśwież, aby spróbować ponownie.',
          );
      } finally {
        morePending.current = false;
        moreRequest.current = null;
        if (alive.current) setLoadingMoreMailbox(false);
      }
    })();
    moreRequest.current = pending;
    return pending;
  }, [groupId, ready, pathname]);
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
    [ready],
  );
  const loadHistory = useCallback(
    async function load(id: string, older = false): Promise<void> {
      if (USE_DEMO_DATA || !ready || !alive.current) return;
      const queuePage = () => {
        if (!older) return;
        const queued = queuedOlder.current.get(id);
        if (queued) return queued;
        const pending = historyCompletions.current.get(id);
        if (!pending) return;
        const next = pending.done
          .then(() => {
            if (
              alive.current &&
              !pending.signal.aborted &&
              activeConversation.current === id
            )
              return load(id, true);
          })
          .finally(() => {
            if (queuedOlder.current.get(id) === next)
              queuedOlder.current.delete(id);
          });
        queuedOlder.current.set(id, next);
        return next;
      };
      if (activeHistories.current.has(id)) return queuePage();
      // A deep link can arrive before the mailbox. Never mark a history loaded
      // while its messages would still be dropped by the membership reducer.
      if (
        !current.current.conversations.some(
          (conversation) => conversation.id === id,
        )
      )
        await refresh();
      if (
        !alive.current ||
        activeConversation.current !== id ||
        !current.current.conversations.some(
          (conversation) => conversation.id === id,
        )
      )
        return;
      if (activeHistories.current.has(id)) return queuePage();
      activeHistories.current.add(id);
      const request = new AbortController();
      historyRequests.current.set(id, request);
      let finish!: () => void;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      historyCompletions.current.set(id, { done, signal: request.signal });
      // A background refresh keeps the page control usable. If pressed, its
      // intent joins this flight and then appends one older page. First loads
      // and explicit appends still wait through their reaction synchronization.
      const blockPagination = older || !historyLru.current.includes(id);
      // A background sync must not insert a loading row above an already open chat.
      setHistories((h) => ({
        ...h,
        [id]: {
          loaded: h[id]?.loaded ?? false,
          loading: older || !h[id]?.loaded,
          requestPending: blockPagination,
          hasMore: h[id]?.hasMore ?? false,
          error: null,
        },
      }));
      try {
        const persisted = current.current.messages.filter(
          (m) => m.conversationId === id && m.sequence !== undefined,
        );
        const before = older ? historyCursor.current.get(id) : undefined;
        const rows = await repository.fetchMessages(id, before, request.signal);
        if (!alive.current || request.signal.aborted) return;
        historyFailures.current.delete(id);
        const conversation = current.current.conversations.find(
          (c) => c.id === id,
        );
        const gap =
          !older &&
          rows.length === 50 &&
          !rows.some((row) => persisted.some((m) => m.id === row.id));
        if (rows.length && (older || !historiesRef.current[id]?.loaded || gap))
          historyCursor.current.set(id, Number(rows.at(-1)!.sequence));
        reduce({
          type: 'history',
          messages: rows.map((m) => messageFromRow(m, groupId, conversation)),
        });
        historyLru.current = [
          id,
          ...historyLru.current.filter((key) => key !== id),
        ].slice(0, 5);
        const keep = new Set([
          ...historyLru.current,
          ...(activeConversation.current ? [activeConversation.current] : []),
        ]);
        reduce({ type: 'trim-history', keepIds: [...keep] });
        for (const key of Object.keys(historiesRef.current))
          if (!keep.has(key)) {
            historyCursor.current.delete(key);
            setHistories((previous) => {
              const next = { ...previous };
              delete next[key];
              return next;
            });
          }
        const retainedMessages = new Set([
          ...current.current.messages
            .filter((m) => keep.has(m.conversationId))
            .map((m) => m.id),
          ...rows.map((m) => m.id),
          ...pendingReactions.current,
        ]);
        setMessageReactions((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([key]) =>
              retainedMessages.has(key),
            ),
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
        setHistories((h) => ({
          ...h,
          [id]: {
            loaded: true,
            loading: false,
            requestPending: blockPagination,
            hasMore:
              older || !h[id]?.loaded || gap
                ? rows.length === 50
                : (h[id]?.hasMore ?? rows.length === 50),
            error: null,
          },
        }));
        // Include older loaded pages: reacting to an old message on another device
        // must update here without downloading the entire text history again.
        const reactionsLoaded = await reloadMessageReactions(
          id,
          [
            ...new Set([
              ...persisted.map((m) => m.id),
              ...rows.map((m) => m.id),
            ]),
          ],
          request.signal,
        );
        if (!reactionsLoaded) {
          historyFailures.current.add(id);
          accountSync?.retryOnPoll('mailbox');
        }
      } catch {
        if (alive.current && !request.signal.aborted) {
          historyFailures.current.add(id);
          accountSync?.retryOnPoll('mailbox');
          setHistories((h) => ({
            ...h,
            [id]: {
              loaded: h[id]?.loaded ?? false,
              loading: false,
              hasMore: h[id]?.hasMore ?? false,
              error: 'Nie udało się pobrać wiadomości. Spróbuj ponownie.',
            },
          }));
        }
      } finally {
        activeHistories.current.delete(id);
        historyRequests.current.delete(id);
        historyCompletions.current.delete(id);
        finish();
        if (alive.current)
          setHistories((h) =>
            h[id]
              ? {
                  ...h,
                  [id]: { ...h[id], loading: false, requestPending: false },
                }
              : h,
          );
      }
    },
    [groupId, ready, reloadMessageReactions, refresh, accountSync],
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
    [ready, reloadMessageReactions],
  );
  const synchronize = useCallback(async () => {
    await refresh();
    if (!lastRefreshSucceeded.current) return false;
    const id = activeConversation.current;
    if (id && alive.current) await loadHistory(id);
    return !id || !historyFailures.current.has(id);
  }, [refresh, loadHistory]);
  useAccountSyncJob('mailbox', synchronize, ready);
  const perform = useCallback(
    async <T,>(
      key: string,
      operation: () => Promise<T>,
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (!ready || !alive.current || pendingActions.current.has(key))
        return { ok: false };
      pendingActions.current.add(key);
      setBusy(true);
      setActionError(null);
      try {
        const value = await operation();
        if (!alive.current) return { ok: false };
        accountSync?.invalidate('event');
        return { ok: true, value };
      } catch (e) {
        if (alive.current) setActionError(repository.messagingError(e));
        accountSync?.invalidate('event');
        return { ok: false };
      } finally {
        pendingActions.current.delete(key);
        if (alive.current) setBusy(pendingActions.current.size > 0);
      }
    },
    [ready, accountSync],
  );
  const invite = async (
    tripId: string,
    text: string,
    key: string,
    sourceId?: string,
  ) => {
    if (USE_DEMO_DATA) {
      dispatch({
        type: 'invite',
        tripId,
        groupId: demoProposals().find((p) => p.trip.id === tripId)!.group.id,
        text,
        ownTripId: sourceId,
      });
      return true;
    }
    const result = await perform('invite:' + key, () =>
      repository.inviteContact(tripId, text, key, sourceId),
    );
    if (result.ok)
      reduce({ type: 'view', view: 'invitations', direction: 'sent' });
    return result.ok;
  };
  const respond = async (
    id: string,
    response: 'accepted' | 'declined' | 'withdrawn',
  ) => {
    if (USE_DEMO_DATA) {
      dispatch({
        type:
          response === 'accepted'
            ? 'accept'
            : response === 'declined'
              ? 'decline'
              : 'withdraw',
        invitationId: id,
      });
      return null;
    }
    const result = await perform('respond:' + id, () =>
      repository.respondInvitation(id, response),
    );
    if (result.ok && response === 'accepted')
      reduce({ type: 'view', view: 'conversations' });
    return result.ok ? result.value : false;
  };
  const inviteProfile = async (id: string, text: string, key: string) => {
    if (USE_DEMO_DATA) {
      dispatch({ type: 'invite', groupId: id, tripId: null, text });
      return true;
    }
    const result = await perform('invite:' + key, () =>
      repository.inviteProfile(id, text, key),
    );
    if (result.ok)
      reduce({ type: 'view', view: 'invitations', direction: 'sent' });
    return result.ok;
  };
  const send = async (id: string, text: string, requestKey?: string) => {
    if (USE_DEMO_DATA) {
      dispatch(
        requestKey
          ? { type: 'retry', messageId: requestKey }
          : { type: 'send', conversationId: id, text },
      );
      return;
    }
    const key = requestKey ?? createRequestKey();
    if (pendingActions.current.has('send:' + key)) return;
    const conversation = current.current.conversations.find((c) => c.id === id);
    if (!conversation || conversation.blocked || !text.trim()) return;
    reduce({
      type: 'outbox',
      message: {
        id: 'outbox-' + key,
        requestKey: key,
        conversationId: id,
        text: text.trim(),
        sender: 'self',
        status: 'sending',
        read: false,
        createdAt: new Date().toISOString(),
      },
    });
    const result = await perform('send:' + key, async () => {
      const row = await repository.sendMessage(id, text, key);
      if (alive.current)
        reduce({
          type: 'message-saved',
          requestKey: key,
          message: messageFromRow(row, groupId, conversation),
        });
    });
    if (!result.ok && alive.current)
      reduce({ type: 'message-failed', requestKey: key });
  };
  const markRead = useCallback(
    async (id: string, throughId: string) => {
      if (USE_DEMO_DATA) {
        reduce({ type: 'read', conversationId: id });
        return;
      }
      const key = 'read:' + id;
      if (reading.current.has(key)) return;
      reading.current.add(key);
      try {
        const sequence = await repository.persistRead(id, throughId);
        accountSync?.invalidate('event');
        if (alive.current)
          reduce({ type: 'read-confirmed', conversationId: id, sequence });
      } catch {
        if (alive.current)
          setActionError('Nie udało się potwierdzić odczytu. Odśwież rozmowę.');
      } finally {
        reading.current.delete(key);
      }
    },
    [accountSync],
  );
  const setBlock = async (id: string, blocked: boolean) => {
    if (USE_DEMO_DATA) {
      dispatch({ type: blocked ? 'block' : 'unblock', groupId: id });
      return true;
    }
    const result = await perform('block:' + id, () =>
      repository.persistBlock(id, blocked),
    );
    if (result.ok) await refreshDiscovery();
    return result.ok;
  };
  const report = async (id: string, reason: ReportReason, key: string) => {
    if (USE_DEMO_DATA) {
      dispatch({ type: 'report', conversationId: id, reason });
      return true;
    }
    return (
      await perform('report:' + key, () =>
        repository.persistReport(id, reason, key),
      )
    ).ok;
  };
  const contact = (id: string) =>
    state.contacts?.[id] ??
    (USE_DEMO_DATA
      ? DEMO_PUBLIC_GROUPS.find((p) => p.group.id === id)?.group
      : undefined);
  const trip = (id: string | null) =>
    id
      ? (state.trips?.[id] ??
        (USE_DEMO_DATA
          ? demoProposals().find((p) => p.trip.id === id)?.trip
          : undefined))
      : undefined;
  const value = {
    state,
    dispatch,
    hasLoaded,
    error,
    actionError,
    busy,
    realtime,
    histories,
    messageReactions,
    messageReactionErrors,
    reloadMessageReactions,
    reactToMessage,
    refresh,
    loadHistory,
    loadMoreMailbox,
    loadingMoreMailbox,
    invite,
    inviteProfile,
    respond,
    send,
    markRead,
    setBlock,
    report,
    contact,
    trip,
  };
  const store = useActionStore(value);
  return <MessagingContext value={store}>{children}</MessagingContext>;
}
export function useMessagingSelector<T>(
  select: (value: MessagingContextValue) => T,
  equal?: (a: T, b: T) => boolean,
) {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('MessagingProvider is required');
  return useStoreSelector(value, select, equal);
}
export function useMessaging() {
  return useMessagingSelector((value) => value);
}

export function useConversation(id: string) {
  return useMessagingSelector(
    (value) => {
      const {
        state,
        send,
        setBlock,
        markRead,
        loadHistory,
        refresh,
        hasLoaded,
        error,
        actionError,
      } = value;
      const conversation = state.conversations.find(
        (item) => item.id === id && isConversationAccepted(state, item),
      );
      return {
        conversation,
        group: conversation ? value.contact(conversation.groupId) : undefined,
        plan: conversation ? value.trip(conversation.tripId) : undefined,
        history: value.histories[id],
        messages: state.messages.filter(
          (message) => message.conversationId === id,
        ),
        unread: unreadCount(state, id),
        ownBlock:
          !!conversation &&
          state.blockedGroupIds.includes(conversation.groupId),
        canSend: canSendToConversation(state, id),
        loadStatus: state.loadStatus,
        simulateSendError: state.simulateSendError,
        send,
        setBlock,
        markRead,
        loadHistory,
        refresh,
        hasLoaded,
        error,
        actionError,
      };
    },
    (a, b) =>
      Object.keys(a).every((key) => {
        const previous = a[key as keyof typeof a],
          next = b[key as keyof typeof b];
        return (
          Object.is(previous, next) ||
          (Array.isArray(previous) &&
            Array.isArray(next) &&
            previous.length === next.length &&
            previous.every((item, index) => item === next[index]))
        );
      }),
  );
}
