import {
  createContext, useCallback, useContext, useEffect, useReducer, useRef, useState,
  type Dispatch, type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { DEMO_PUBLIC_GROUPS } from '@/features/groups/group-demo';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { getSupabase } from '@/lib/supabase';
import { createRequestKey } from '@/lib/request-key';
import type { MessagingContact, MessagingState, ReportReason } from '@/types/messaging';
import type { TripPlan } from '@/types/travel';
import { canSendToConversation, createMessagingState, messagingReducer, type MessagingAction } from './messaging-state';
import { messageFromRow } from './messaging-mapper';
import * as repository from './messaging-repository';
import type { MessageReactionKind } from './message-reactions-data';

type HistoryStatus = { loaded: boolean; loading: boolean; hasMore: boolean; error: string | null };
interface MessagingContextValue {
  state: MessagingState;
  dispatch: Dispatch<MessagingAction>;
  error: string | null;
  actionError: string | null;
  hasLoaded: boolean;
  busy: boolean;
  realtime: 'connecting' | 'live' | 'reconnecting';
  histories: Record<string, HistoryStatus>;
  messageReactions: Record<string, MessageReactionKind | null>;
  messageReactionErrors: Record<string, string | null>;
  reloadMessageReactions: (id: string, messageIds?: string[]) => Promise<boolean>;
  reactToMessage: (messageId: string, kind: MessageReactionKind | null) => Promise<void>;
  refresh: () => Promise<void>;
  loadHistory: (id: string, older?: boolean) => Promise<void>;
  invite: (tripId: string, text: string, key: string, sourceId?: string) => Promise<boolean>;
  inviteProfile: (groupId: string, text: string, key: string) => Promise<boolean>;
  respond: (id: string, response: 'accepted' | 'declined' | 'withdrawn') => Promise<string | null | false>;
  send: (id: string, text: string, requestKey?: string) => Promise<void>;
  markRead: (id: string, throughId: string) => Promise<void>;
  setBlock: (groupId: string, blocked: boolean) => Promise<boolean>;
  report: (id: string, reason: ReportReason, key: string) => Promise<boolean>;
  contact: (id: string) => MessagingContact | undefined;
  trip: (id: string | null) => TripPlan | undefined;
}
const MessagingContext = createContext<MessagingContextValue | null>(null);
export function MessagingProvider({ children }: { children: ReactNode }) {
  const [state, reduce] = useReducer(messagingReducer, DEMO_MAILBOX, seed => createMessagingState(seed, USE_DEMO_DATA ? 'initial' : 'empty'));
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
  const [realtime, setRealtime] = useState<MessagingContextValue['realtime']>('connecting');
  const [histories, setHistories] = useState<Record<string, HistoryStatus>>({});
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReactionKind | null>>({});
  const [messageReactionErrors, setMessageReactionErrors] = useState<Record<string, string | null>>({});
  const reactionVersions = useRef(new Map<string, number>());
  const reactionLoads = useRef(new Map<string, number>());
  const pendingReactions = useRef(new Set<string>());
  const current = useRef(state);
  const historiesRef = useRef(histories);
  const loaded = useRef(USE_DEMO_DATA);
  const alive = useRef(true);
  const fetching = useRef<Promise<void> | null>(null);
  const refreshAgain = useRef(false);
  const historyCursor = useRef(new Map<string, number>());
  const activeHistories = useRef(new Set<string>());
  const pendingActions = useRef(new Set<string>());
  const reading = useRef(new Set<string>());
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => { historiesRef.current = histories; }, [histories]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Navigation actions remain local; demo mutations never handle real accounts.
  const dispatch = useCallback<Dispatch<MessagingAction>>(action => {
    if (USE_DEMO_DATA || action.type === 'view') reduce(action);
  }, []);
  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA) { reduce({ type: 'ready' }); return; }
    if (!ready || !alive.current) return;
    if (fetching.current) { refreshAgain.current = true; return fetching.current; }
    if (!loaded.current) reduce({ type: 'load-status', status: 'loading' });
    const pending = (async () => {
      try {
        do {
          refreshAgain.current = false;
          const data = await repository.fetchMailbox(groupId);
          if (!alive.current) return;
          reduce({ type: 'hydrate', data });
          setHistories(previous => {
            const entries = Object.entries(previous).filter(([id]) => data.conversations.some(c => c.id === id));
            if (entries.length === Object.keys(previous).length) return previous;
            return Object.fromEntries(entries);
          });
          for (const id of historyCursor.current.keys()) if (!data.conversations.some(c => c.id === id)) historyCursor.current.delete(id);
          loaded.current = true; setHasLoaded(true); setError(null);
        } while (refreshAgain.current);
      } catch {
        if (!alive.current) return;
        if (!loaded.current) reduce({ type: 'load-status', status: 'error' });
        setError('Nie udało się odświeżyć skrzynki. Sprawdź połączenie i spróbuj ponownie.');
      } finally { fetching.current = null; }
    })();
    fetching.current = pending;
    return pending;
  }, [groupId, ready]);
  const reloadMessageReactions = useCallback(async (id: string, messageIds?: string[]) => {
    if (USE_DEMO_DATA) return true;
    if (!ready || !alive.current) return false;
    const ids = messageIds ?? current.current.messages.filter(m => m.conversationId === id && m.sequence !== undefined).map(m => m.id);
    if (!ids.length) return true;
    const load = (reactionLoads.current.get(id) ?? 0) + 1;
    reactionLoads.current.set(id, load);
    const versions = new Map(ids.map(messageId => [messageId, reactionVersions.current.get(messageId) ?? 0]));
    try {
      const rows = await repository.fetchMessageReactions(id, ids);
      if (!alive.current || reactionLoads.current.get(id) !== load) return false;
      setMessageReactions(previous => ({ ...previous, ...Object.fromEntries(rows.filter(row =>
        !pendingReactions.current.has(row.message_id) && (reactionVersions.current.get(row.message_id) ?? 0) === versions.get(row.message_id),
      ).map(row => [row.message_id, row.kind])) }));
      setMessageReactionErrors(previous => ({ ...previous, [id]: null }));
      return true;
    } catch {
      if (alive.current && reactionLoads.current.get(id) === load) setMessageReactionErrors(previous => ({ ...previous, [id]: 'Nie udało się wczytać reakcji. Spróbuj ponownie.' }));
      return false;
    }
  }, [ready]);
  const loadHistory = useCallback(async (id: string, older = false) => {
    if (USE_DEMO_DATA || !ready || !alive.current || activeHistories.current.has(id)) return;
    activeHistories.current.add(id);
    // A background sync must not insert a loading row above an already open chat.
    setHistories(h => ({ ...h, [id]: { loaded: h[id]?.loaded ?? false, loading: older || !h[id]?.loaded, hasMore: h[id]?.hasMore ?? false, error: null } }));
    try {
      const persisted = current.current.messages.filter(m => m.conversationId === id && m.sequence !== undefined);
      const before = older ? historyCursor.current.get(id) : undefined;
      const rows = await repository.fetchMessages(id, before);
      if (!alive.current) return;
      const conversation = current.current.conversations.find(c => c.id === id);
      const gap = !older && rows.length === 50 && !rows.some(row => persisted.some(m => m.id === row.id));
      if (rows.length && (older || !historiesRef.current[id]?.loaded || gap)) historyCursor.current.set(id, Number(rows.at(-1)!.sequence));
      reduce({ type: 'history', messages: rows.map(m => messageFromRow(m, groupId, conversation)) });
      setHistories(h => ({ ...h, [id]: { loaded: true, loading: false,
        hasMore: older || !h[id]?.loaded || gap ? rows.length === 50 : (h[id]?.hasMore ?? rows.length === 50), error: null } }));
      // Include older loaded pages: reacting to an old message on another device
      // must update here without downloading the entire text history again.
      await reloadMessageReactions(id, [...new Set([...persisted.map(m => m.id), ...rows.map(m => m.id)])]);
    } catch {
      if (alive.current) setHistories(h => ({ ...h, [id]: { loaded: h[id]?.loaded ?? false, loading: false, hasMore: h[id]?.hasMore ?? false, error: 'Nie udało się pobrać wiadomości. Spróbuj ponownie.' } }));
    } finally { activeHistories.current.delete(id); }
  }, [groupId, ready, reloadMessageReactions]);
  const reactToMessage = useCallback(async (messageId: string, kind: MessageReactionKind | null) => {
    const message = current.current.messages.find(m => m.id === messageId);
    if (!alive.current || !message || message.sender !== 'other' || message.status !== 'sent'
      || !canSendToConversation(current.current, message.conversationId) || pendingReactions.current.has(messageId)) throw new Error('Message unavailable');
    pendingReactions.current.add(messageId);
    reactionVersions.current.set(messageId, (reactionVersions.current.get(messageId) ?? 0) + 1);
    try {
      if (!USE_DEMO_DATA) {
        if (!ready) throw new Error('Session unavailable');
        await repository.persistMessageReaction(messageId, kind);
      }
      if (alive.current) setMessageReactions(previous => ({ ...previous, [messageId]: kind }));
    } finally {
      pendingReactions.current.delete(messageId);
      reactionVersions.current.set(messageId, (reactionVersions.current.get(messageId) ?? 0) + 1);
      // Also reconcile a write whose response was lost. Repeating the same choice
      // is an idempotent set, not a toggle that could accidentally undo it.
      if (alive.current) void reloadMessageReactions(message.conversationId);
    }
  }, [ready, reloadMessageReactions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (USE_DEMO_DATA || !ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const synchronize = () => {
      if (!alive.current || AppState.currentState !== 'active') return;
      void (async () => {
        await refresh();
        for (const id of Object.keys(historiesRef.current)) void loadHistory(id);
      })();
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(synchronize, 150); };
    const client = getSupabase();
    let channel = client.channel('mailbox-' + userId, { config: { postgres_changes_options: { wait: true } } });
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'mailbox_updates', filter: 'group_id=eq.' + groupId }, schedule);
    channel.subscribe(status => {
      if (!alive.current) return;
      if (status === 'SUBSCRIBED') { setRealtime('live'); schedule(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtime('reconnecting');
    });
    const interval = setInterval(synchronize, 20000);
    const foreground = AppState.addEventListener('change', value => { if (value === 'active') synchronize(); });
    return () => { clearTimeout(timer); clearInterval(interval); foreground.remove(); void client.removeChannel(channel); };
  }, [ready, userId, groupId, refresh, loadHistory]);
  const perform = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (!ready || !alive.current || pendingActions.current.has(key)) return { ok: false };
    pendingActions.current.add(key); setBusy(true); setActionError(null);
    try {
      const value = await operation();
      if (!alive.current) return { ok: false };
      await refresh();
      return { ok: true, value };
    } catch (e) {
      if (alive.current) setActionError(repository.messagingError(e));
      await refresh();
      return { ok: false };
    } finally {
      pendingActions.current.delete(key);
      if (alive.current) setBusy(pendingActions.current.size > 0);
    }
  }, [ready, refresh]);
  const invite = async (tripId: string, text: string, key: string, sourceId?: string) => {
    if (USE_DEMO_DATA) { dispatch({ type: 'invite', tripId, groupId: DEMO_PROPOSALS.find(p => p.trip.id === tripId)!.group.id, text, ownTripId: sourceId }); return true; }
    const result = await perform('invite:' + key, () => repository.inviteContact(tripId, text, key, sourceId));
    if (result.ok) reduce({ type: 'view', view: 'invitations', direction: 'sent' });
    return result.ok;
  };
  const respond = async (id: string, response: 'accepted' | 'declined' | 'withdrawn') => {
    if (USE_DEMO_DATA) { dispatch({ type: response === 'accepted' ? 'accept' : response === 'declined' ? 'decline' : 'withdraw', invitationId: id }); return null; }
    const result = await perform('respond:' + id, () => repository.respondInvitation(id, response));
    if (result.ok && response === 'accepted') reduce({ type: 'view', view: 'conversations' });
    return result.ok ? result.value : false;
  };
  const inviteProfile = async (id: string, text: string, key: string) => {
    if (USE_DEMO_DATA) { dispatch({ type: 'invite', groupId: id, tripId: null, text }); return true; }
    const result = await perform('invite:' + key, () => repository.inviteProfile(id, text, key));
    if (result.ok) reduce({ type: 'view', view: 'invitations', direction: 'sent' });
    return result.ok;
  };
  const send = async (id: string, text: string, requestKey?: string) => {
    if (USE_DEMO_DATA) { dispatch(requestKey ? { type: 'retry', messageId: requestKey } : { type: 'send', conversationId: id, text }); return; }
    const key = requestKey ?? createRequestKey();
    if (pendingActions.current.has('send:' + key)) return;
    const conversation = current.current.conversations.find(c => c.id === id);
    if (!conversation || conversation.blocked || !text.trim()) return;
    reduce({ type: 'outbox', message: { id: 'outbox-' + key, requestKey: key, conversationId: id, text: text.trim(), sender: 'self', status: 'sending', read: false, createdAt: new Date().toISOString() } });
    const result = await perform('send:' + key, async () => {
      const row = await repository.sendMessage(id, text, key);
      if (alive.current) reduce({ type: 'message-saved', requestKey: key, message: messageFromRow(row, groupId, conversation) });
    });
    if (!result.ok && alive.current) reduce({ type: 'message-failed', requestKey: key });
  };
  const markRead = useCallback(async (id: string, throughId: string) => {
    if (USE_DEMO_DATA) { reduce({ type: 'read', conversationId: id }); return; }
    const key = 'read:' + id;
    if (reading.current.has(key)) return;
    reading.current.add(key);
    try {
      const sequence = await repository.persistRead(id, throughId);
      if (alive.current) reduce({ type: 'read-confirmed', conversationId: id, sequence });
      await refresh();
    } catch { if (alive.current) setActionError('Nie udało się potwierdzić odczytu. Odśwież rozmowę.'); }
    finally { reading.current.delete(key); }
  }, [refresh]);
  const setBlock = async (id: string, blocked: boolean) => {
    if (USE_DEMO_DATA) { dispatch({ type: blocked ? 'block' : 'unblock', groupId: id }); return true; }
    const result = await perform('block:' + id, () => repository.persistBlock(id, blocked));
    if (result.ok) await refreshDiscovery();
    return result.ok;
  };
  const report = async (id: string, reason: ReportReason, key: string) => {
    if (USE_DEMO_DATA) { dispatch({ type: 'report', conversationId: id, reason }); return true; }
    return (await perform('report:' + key, () => repository.persistReport(id, reason, key))).ok;
  };
  const contact = (id: string) => state.contacts?.[id] ?? (USE_DEMO_DATA ? DEMO_PUBLIC_GROUPS.find(p => p.group.id === id)?.group : undefined);
  const trip = (id: string | null) => id ? state.trips?.[id] ?? (USE_DEMO_DATA ? DEMO_PROPOSALS.find(p => p.trip.id === id)?.trip : undefined) : undefined;
  return <MessagingContext value={{ state, dispatch, hasLoaded, error, actionError, busy, realtime, histories, messageReactions, messageReactionErrors, reloadMessageReactions, reactToMessage, refresh, loadHistory, invite, inviteProfile, respond, send, markRead, setBlock, report, contact, trip }}>{children}</MessagingContext>;
}
export function useMessaging() {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('MessagingProvider is required');
  return value;
}
