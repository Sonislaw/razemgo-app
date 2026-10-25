import { getTripHeadline } from '@/features/trips/trip-headline';
import { DataStatus } from '@/components/ui/data-status';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  AppState,
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
import {
  AppText,
  Button,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import {
  getScenicHeaderLayout,
  ScenicHeaderBackground,
} from '@/components/ui/scenic-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { Fonts, MaxContentWidth, Typography } from '@/constants/theme';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { useProfile } from '@/features/profile/profile-context';
import {
  formatTripDates,
  getTripLocation,
} from '@/features/discovery/filter-trips';
import { ConversationSafety } from '@/features/messaging/conversation-safety';
import { DemoControls } from '@/features/messaging/demo-controls';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  canSendToConversation,
  formatMessageDate,
  formatMessageTime,
  isConversationAccepted,
  MAX_MESSAGE_LENGTH,
  unreadCount,
} from '@/features/messaging/messaging-state';
import { GroupAvatar, MailboxEmpty } from '@/features/messaging/messaging-ui';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/messaging';
import { crewNumberText } from '@/features/profile/crew-number';

export function generateStaticParams() {
  return DEMO_MAILBOX.conversations.map((conversation) => ({
    id: conversation.id,
  }));
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, contact, trip: contactTrip, send: sendMessage, setBlock, markRead, loadHistory,
    refresh, histories, hasLoaded, error, actionError, busy } = useMessaging();
  const { profile } = useProfile();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { height: headerHeight } = getScenicHeaderLayout(width);
  const [draft, setDraft] = useState('');
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const list = useRef<FlatListInstance>(null);
  const atBottom = useRef(true);
  const focused = useRef(false);
  const conversation = state.conversations.find(
    (item) => item.id === id && isConversationAccepted(state, item),
  );
  const group = conversation ? contact(conversation.groupId) : undefined;
  const plan = conversation ? contactTrip(conversation.tripId) : undefined;
  const history = histories[id];
  const messages = state.messages.filter(item => item.conversationId === id);
  const latest = messages.filter(item => item.sequence !== undefined || IS_DEMO_MODE).at(-1);
  const unread = unreadCount(state, id);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      void loadHistory(id);
      return () => { focused.current = false; };
    }, [id, refresh, loadHistory]),
  );
  useFocusEffect(
    useCallback(() => {
      if (unread && latest && atBottom.current && (history?.loaded || IS_DEMO_MODE) && AppState.currentState === 'active') void markRead(id, latest.id);
    }, [id, unread, latest, history?.loaded, markRead]),
  );
  const back = () => router.dismissTo('/messages');
  if (!hasLoaded) return <Screen><DataStatus status={state.loadStatus} error={error} onRetry={() => { void refresh(); }} /><Button label="Wróć do Wiadomości" variant="secondary" onPress={back} /></Screen>;
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
  const ownBlock = state.blockedGroupIds.includes(conversation.groupId);
  const blocked = ownBlock || conversation.blocked;
  const canSend = canSendToConversation(state, id) && !busy;
  const send = () => {
    if (!canSend || !draft.trim()) return;
    void sendMessage(id, draft);
    atBottom.current = true;
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
          <GroupAvatar groupId={conversation.groupId} avatarId={group.avatarId} size={40} />
          <Pressable accessibilityRole="button" accessibilityLabel={'Zobacz profil: ' + group.name}
            onPress={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })} style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }}>
            <AppText
              accessibilityRole="header"
              variant="label"
              numberOfLines={1}
            >
              {group.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {crewNumberText(group.crewNumber) ? crewNumberText(group.crewNumber) + ' · ' : ''}
              {plan ? getTripHeadline(plan) : 'Kontakt z profilu'}
            </AppText>
          </Pressable>
          <IconButton
            label="Opcje bezpieczeństwa rozmowy"
            icon="more"
            onPress={() => setSafetyOpen(true)}
          />
        </View>
        {plan ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            'Wspólny wyjazd: ' + getTripHeadline(plan)
          }
          onPress={() =>
            router.push({
              pathname: plan.groupId === profile.group.id ? '/trips/[id]' : '/trip/[id]',
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
            <AppText variant="caption">
              {formatTripDates(plan)}
            </AppText>
          </View>
          <Icon name="chevron" size={18} />
        </Pressable> : null}
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
              {state.simulateSendError ? ' · symulacja błędu wysyłania' : ''}
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
        {error ? <DataStatus status="error" error={error} onRetry={() => { void refresh(); void loadHistory(id); }} /> : null}
        {actionError ? <AppText accessibilityRole="alert" variant="caption" color="textSecondary" style={{ padding: 8 }}>{actionError}</AppText> : null}
        <FlatList<ChatMessage>
          ref={list}
          style={{ flex: 1, minHeight: 0 }}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          ListFooterComponent={ScenicFooter}
          ListFooterComponentStyle={{
            marginTop: 'auto',
            marginHorizontal: -16,
            marginBottom: -16,
          }}
          ListHeaderComponent={
            <View style={{ gap: 8 }}>
              {history?.loading ? <AppText variant="caption" color="textSecondary">Wczytywanie wiadomości…</AppText> : null}
              {history?.error ? <DataStatus status="error" error={history.error} onRetry={() => { void loadHistory(id); }} /> : null}
              {history?.hasMore ? <Button label="Wczytaj starsze wiadomości" variant="secondary" disabled={history.loading}
                onPress={() => { atBottom.current = false; void loadHistory(id, true); }} /> : null}
            </View>
          }
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
            if (atBottom.current && focused.current && unread && latest && (history?.loaded || IS_DEMO_MODE) && AppState.currentState === 'active') void markRead(id, latest.id);
          }}
          scrollEventThrottle={100}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={() =>
            atBottom.current && list.current?.scrollToEnd({ animated: false })
          }
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <AppText color="textSecondary" style={{ textAlign: 'center' }}>
              Napisz pierwsze „cześć”!
            </AppText>
          }
          renderItem={({ item, index }) => {
            const self = item.sender === 'self';
            const firstOfDay =
              !index ||
              messages[index - 1].createdAt.slice(0, 10) !==
                item.createdAt.slice(0, 10);
            return (
              <View style={{ gap: 12 }}>
                {firstOfDay ? (
                  <AppText
                    variant="caption"
                    color="textSecondary"
                    style={{ textAlign: 'center' }}
                  >
                    {formatMessageDate(item.createdAt)}
                  </AppText>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    {
                      alignSelf: self ? 'flex-end' : 'flex-start',
                      backgroundColor: self
                        ? theme.primaryStrong
                        : theme.backgroundElement,
                      borderColor: self ? theme.primaryStrong : theme.border,
                      borderBottomLeftRadius: self ? 18 : 4,
                      borderBottomRightRadius: self ? 4 : 18,
                    },
                  ]}
                >
                  <AppText
                    style={{
                      color: self ? theme.onPrimary : theme.text,
                      fontSize: 15,
                      lineHeight: 22,
                    }}
                  >
                    {item.text}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{
                      color: self ? theme.onPrimary : theme.textSecondary,
                      textAlign: 'right',
                    }}
                  >
                    {formatMessageTime(item.createdAt)}
                    {self
                      ? item.status === 'sending'
                        ? ' · Wysyłanie…'
                        : item.status === 'failed'
                        ? ' · Nie wysłano'
                        : item.read ? ' · Odczytano' : ' · Wysłano'
                      : ''}
                  </AppText>
                </View>
                {item.status === 'failed' ? (
                  <View
                    style={{ alignSelf: 'flex-end', maxWidth: '90%', gap: 4 }}
                  >
                    <AppText variant="caption" color="textSecondary">
                      Nie udało się wysłać wiadomości. Spróbuj ponownie.
                    </AppText>
                    <Button
                      label="Ponów wysyłanie"
                      icon="refresh"
                      variant="secondary"
                      disabled={!canSend || state.simulateSendError}
                      onPress={() =>
                        void sendMessage(id, item.text, item.requestKey ?? item.id)
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
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
              <AppText variant="label">{ownBlock ? 'Ekipa jest zablokowana' : 'Kontakt z tą ekipą jest niedostępny'}</AppText>
              {ownBlock ? <Button
                label="Odblokuj ekipę"
                variant="secondary"
                onPress={() =>
                  void setBlock(conversation.groupId, false)
                }
              /> : null}
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
  bubble: {
    maxWidth: '88%',
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
