import { TripTimeline } from '@/components/trips/trip-timeline';
import { DataStatus } from '@/components/ui/data-status';
import { Icon } from '@/components/ui/icon';
import {
  AppText,
  Button,
  IconButton,
  layout,
  Screen,
} from '@/components/ui/primitives';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import {
  getScenicHeaderLayout,
  ScenicHeaderBackground,
} from '@/components/ui/scenic-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { Fonts, MaxContentWidth, Typography } from '@/constants/theme';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import {
  formatTripDates,
  getTripLocation,
} from '@/features/discovery/filter-trips';
import { ChatMessageRow } from '@/features/messaging/chat-message-row';
import { createChatScrollController } from '@/features/messaging/chat-scroll';
import { ConversationSafety } from '@/features/messaging/conversation-safety';
import { DemoControls } from '@/features/messaging/demo-controls';
import { MessageReactionPicker } from '@/features/messaging/message-reactions-ui';
import { useConversation } from '@/features/messaging/messaging-context';
import { MAX_MESSAGE_LENGTH } from '@/features/messaging/messaging-state';
import { GroupAvatar, MailboxEmpty } from '@/features/messaging/messaging-ui';
import { useProfile } from '@/features/profile/profile-context';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/messaging';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type FlatListInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function generateStaticParams() {
  return DEMO_MAILBOX.conversations.map((conversation) => ({
    id: conversation.id,
  }));
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    conversation,
    group,
    plan,
    history,
    messages,
    unread,
    ownBlock,
    canSend,
    loadStatus,
    simulateSendError,
    send: sendMessage,
    setBlock,
    markRead,
    loadHistory,
    refresh,
    hasLoaded,
    error,
    actionError,
  } = useConversation(id);
  const { profile } = useProfile();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { height: headerHeight } = getScenicHeaderLayout(width);
  const [draft, setDraft] = useState('');
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(
    null,
  );
  const list = useRef<FlatListInstance>(null);
  const scroll = useRef(createChatScrollController());
  useLayoutEffect(() => {
    scroll.current = createChatScrollController();
  }, [id]);
  const focused = useRef(false);
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);
  const historyReady = !!history?.loaded || IS_DEMO_MODE;
  const tail = messages.at(-1);
  const tailKey = tail?.requestKey ?? tail?.id ?? null;
  const reactionMessage = messages.find(
    (message) => message.id === reactionMessageId,
  );
  useLayoutEffect(() => {
    scroll.current.messagesChanged(tailKey, historyReady);
  }, [id, tailKey, historyReady]);
  const latest = messages
    .filter((item) => item.sequence !== undefined || IS_DEMO_MODE)
    .at(-1);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh().then(() => loadHistory(id));
      return () => {
        focused.current = false;
      };
    }, [id, refresh, loadHistory]),
  );
  useFocusEffect(
    useCallback(() => {
      if (
        unread &&
        latest &&
        scroll.current.isAtBottom() &&
        (history?.loaded || IS_DEMO_MODE) &&
        AppState.currentState === 'active'
      )
        void markRead(id, latest.id);
    }, [id, unread, latest, history?.loaded, markRead]),
  );
  const back = () => router.dismissTo('/messages');
  if (!hasLoaded)
    return (
      <Screen>
        <DataStatus
          status={loadStatus}
          error={error}
          onRetry={() => {
            void refresh();
          }}
        />
        <Button label="Wróć do Wiadomości" variant="secondary" onPress={back} />
      </Screen>
    );
  if (!conversation || !group)
    return (
      <Screen>
        <MailboxEmpty
          title="Rozmowa jeszcze niedostępna"
          description="Kontakt rozpoczyna się po akceptacji zaproszenia."
        >
          <Button label="Wróć do Wiadomości" onPress={back} />
        </MailboxEmpty>
      </Screen>
    );
  const blocked = ownBlock || conversation.blocked;
  const send = () => {
    if (!canSend || !draft.trim()) return;
    scroll.current.requestBottom();
    list.current?.scrollToOffset({ offset: 0, animated: false });
    void sendMessage(id, draft);
    setDraft('');
  };
  return (
    <KeyboardAvoidingView
      testID="chat-screen"
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              borderBottomColor: theme.border,
              backgroundColor: theme.backgroundElement,
              minHeight: headerHeight,
              paddingBottom: headerHeight - 56,
            },
          ]}
        >
          <ScenicHeaderBackground style={{ top: 0 }} />
          <IconButton label="Wróć do Wiadomości" icon="back" onPress={back} />
          <GroupAvatar
            groupId={conversation.groupId}
            avatarId={group.avatarId}
            size={40}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Zobacz profil: ' + group.name}
            onPress={() =>
              router.push({ pathname: '/crew/[id]', params: { id: group.id } })
            }
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              justifyContent: 'center',
            }}
          >
            <AppText
              accessibilityRole="header"
              variant="label"
              numberOfLines={1}
            >
              {group.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {plan ? getTripHeadline(plan) : 'Kontakt z profilu'}
            </AppText>
          </Pressable>
          <IconButton
            label="Opcje bezpieczeństwa rozmowy"
            icon="more"
            onPress={() => setSafetyOpen(true)}
          />
        </View>
        {plan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Wspólny wyjazd: ' + getTripHeadline(plan)}
            onPress={() =>
              router.push({
                pathname:
                  plan.groupId === profile.group.id
                    ? '/trips/[id]'
                    : '/trip/[id]',
                params: { id: plan.id },
              })
            }
            style={[styles.pinned, { backgroundColor: theme.hero }]}
          >
            <Icon name="trips" size={20} />
            <View style={{ flex: 1 }}>
              <AppText
                variant="caption"
                style={{ fontWeight: '700' }}
                numberOfLines={1}
              >
                {getTripLocation(plan)}
              </AppText>
              <AppText variant="caption">{formatTripDates(plan)}</AppText>
              <TripTimeline trip={plan} compact />
            </View>
            <Icon name="chevron" size={18} />
          </Pressable>
        ) : null}
        {IS_DEMO_MODE ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scenariusze demonstracyjne"
            onPress={() => setDemoOpen(true)}
            style={{
              minHeight: 48,
              paddingHorizontal: 16,
              justifyContent: 'center',
            }}
          >
            <AppText variant="caption" color="textSecondary">
              Rozmowa demonstracyjna · tylko na tym urządzeniu
              {simulateSendError ? ' · symulacja błędu wysyłania' : ''}
            </AppText>
          </Pressable>
        ) : null}
        {reported ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ padding: 12, backgroundColor: theme.positiveBackground }}
          >
            <AppText variant="caption" color="positive">
              Zgłoszenie zapisane.
            </AppText>
          </View>
        ) : null}
        {error ? (
          <DataStatus
            status="error"
            error={error}
            onRetry={() => {
              void refresh();
              void loadHistory(id);
            }}
          />
        ) : null}
        {actionError ? (
          <AppText
            accessibilityRole="alert"
            variant="caption"
            color="textSecondary"
            style={{ padding: 8 }}
          >
            {actionError}
          </AppText>
        ) : null}
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          >
            <ScenicFooter />
          </View>
          <FlatList<ChatMessage>
            testID="chat-message-list"
            ref={list}
            style={{ flex: 1, minHeight: 0 }}
            inverted
            data={historyReady ? displayMessages : []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
            ListFooterComponent={
              <View style={{ gap: 8 }}>
                {history?.loading && !history.loaded ? (
                  <AppText variant="caption" color="textSecondary">
                    Wczytywanie wiadomości…
                  </AppText>
                ) : null}
                {history?.error ? (
                  <DataStatus
                    status="error"
                    error={history.error}
                    onRetry={() => {
                      void loadHistory(id);
                    }}
                  />
                ) : null}
                {history?.hasMore ? (
                  <Button
                    label={
                      history.loading
                        ? 'Wczytywanie…'
                        : 'Wczytaj starsze wiadomości'
                    }
                    variant="secondary"
                    disabled={history.loading || history.requestPending}
                    onPress={() => {
                      scroll.current.readingOlder();
                      void loadHistory(id, true);
                    }}
                  />
                ) : null}
              </View>
            }
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              scroll.current.scrolled(
                contentOffset.y,
                contentSize.height,
                layoutMeasurement.height,
              );
              if (
                scroll.current.isAtBottom() &&
                focused.current &&
                unread &&
                latest &&
                (history?.loaded || IS_DEMO_MODE) &&
                AppState.currentState === 'active'
              )
                void markRead(id, latest.id);
            }}
            scrollEventThrottle={100}
            onScrollBeginDrag={() => scroll.current.readingOlder()}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 100,
            }}
            onContentSizeChange={() =>
              scroll.current.contentChanged() &&
              list.current?.scrollToOffset({ offset: 0, animated: false })
            }
            onLayout={(event) => {
              if (
                scroll.current.viewportChanged(event.nativeEvent.layout.height)
              )
                list.current?.scrollToOffset({ offset: 0, animated: false });
            }}
            ListEmptyComponent={
              historyReady ? (
                <AppText color="textSecondary" style={{ textAlign: 'center' }}>
                  Napisz pierwsze „cześć”!
                </AppText>
              ) : undefined
            }
            renderItem={({ item, index }) => (
              <ChatMessageRow
                item={item}
                firstOfDay={
                  index === displayMessages.length - 1 ||
                  displayMessages[index + 1].createdAt.slice(0, 10) !==
                    item.createdAt.slice(0, 10)
                }
                canSend={canSend}
                simulateSendError={simulateSendError}
                onReact={setReactionMessageId}
                onRetry={(message) => {
                  void sendMessage(
                    id,
                    message.text,
                    message.requestKey ?? message.id,
                  );
                }}
              />
            )}
          />
        </View>
        <View
          style={{
            paddingBottom: Math.max(8, insets.bottom),
            backgroundColor: theme.backgroundElement,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          {blocked ? (
            <View style={{ padding: 12, gap: 8 }}>
              <AppText variant="label">
                {ownBlock
                  ? 'Ekipa jest zablokowana'
                  : 'Kontakt z tą ekipą jest niedostępny'}
              </AppText>
              {ownBlock ? (
                <Button
                  label="Odblokuj ekipę"
                  variant="secondary"
                  onPress={() => void setBlock(conversation.groupId, false)}
                />
              ) : null}
            </View>
          ) : (
            <>
              {!canSend ? (
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={{ paddingHorizontal: 12, paddingTop: 8 }}
                >
                  Wysyłanie chwilowo niedostępne. Spróbuj ponownie za chwilę.
                </AppText>
              ) : null}
              <View
                style={[layout.row, { alignItems: 'flex-end', padding: 8 }]}
              >
                <TextInput
                  accessibilityLabel="Treść wiadomości"
                  placeholder="Napisz wiadomość…"
                  placeholderTextColor={theme.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={MAX_MESSAGE_LENGTH}
                  editable={canSend}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Wyślij wiadomość"
                  accessibilityState={{ disabled: !canSend || !draft.trim() }}
                  disabled={!canSend || !draft.trim()}
                  onPress={send}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      canSend && draft.trim()
                        ? theme.primaryStrong
                        : theme.disabled,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Icon
                    name="send"
                    size={22}
                    color={
                      canSend && draft.trim()
                        ? theme.onPrimary
                        : theme.disabledText
                    }
                  />
                </Pressable>
              </View>
              {draft.length > 1800 ? (
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={{ paddingHorizontal: 16 }}
                >
                  {draft.length}/{MAX_MESSAGE_LENGTH}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      </View>
      {safetyOpen ? (
        <ConversationSafety
          conversation={conversation}
          onClose={() => setSafetyOpen(false)}
          onReport={() => setReported(true)}
        />
      ) : null}
      {demoOpen ? <DemoControls onClose={() => setDemoOpen(false)} /> : null}
      {reactionMessage && reactionMessage.sender === 'other' ? (
        <MessageReactionPicker
          key={reactionMessage.id}
          message={reactionMessage}
          onClose={() => setReactionMessageId(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    padding: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  pinned: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
  },
  bubbleFrame: {
    maxWidth: '88%',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    maxHeight: 128,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    ...Typography.body,
  },
});
