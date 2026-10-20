import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
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
import { IS_DEMO_MODE } from '@/constants/app';
import { Fonts, MaxContentWidth, Typography } from '@/constants/theme';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
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

export function generateStaticParams() {
  return DEMO_MAILBOX.conversations.map((conversation) => ({
    id: conversation.id,
  }));
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useMessaging();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const conversation = state.conversations.find(
    (item) => item.id === id && isConversationAccepted(state, item),
  );
  const proposal = DEMO_PROPOSALS.find(
    (item) => item.trip.id === conversation?.tripId,
  );
  const unread = unreadCount(state, id);
  useFocusEffect(
    useCallback(() => {
      if (unread) dispatch({ type: 'read', conversationId: id });
    }, [dispatch, id, unread]),
  );
  const back = () => router.dismissTo('/messages');
  if (!conversation || !proposal)
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
  const blocked = state.blockedGroupIds.includes(conversation.groupId);
  const canSend = canSendToConversation(state, id);
  const messages = state.messages.filter((item) => item.conversationId === id);
  const send = () => {
    if (!canSend || !draft.trim()) return;
    dispatch({ type: 'send', conversationId: id, text: draft });
    setDraft('');
  };
  return (
    <KeyboardAvoidingView
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
            },
          ]}
        >
          <IconButton label="Wróć do Wiadomości" icon="back" onPress={back} />
          <GroupAvatar groupId={conversation.groupId} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              accessibilityRole="header"
              variant="label"
              numberOfLines={1}
            >
              {proposal.group.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {getTripHeadline(proposal.trip)}
            </AppText>
          </View>
          <IconButton
            label="Opcje bezpieczeństwa rozmowy"
            icon="more"
            onPress={() => setSafetyOpen(true)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            'Wspólny wyjazd: ' + getTripHeadline(proposal.trip)
          }
          onPress={() =>
            router.push({
              pathname: '/trip/[id]',
              params: { id: proposal.trip.id },
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
              {getTripLocation(proposal.trip)}
            </AppText>
            <AppText variant="caption">
              {formatTripDates(proposal.trip)}
            </AppText>
          </View>
          <Icon name="chevron" size={18} />
        </Pressable>
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
        <FlatList
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
          onContentSizeChange={() =>
            list.current?.scrollToEnd({ animated: false })
          }
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <AppText color="textSecondary" style={{ textAlign: 'center' }}>
              Napiszcie pierwsze „cześć”!
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
                      ? item.status === 'failed'
                        ? ' · Nie wysłano'
                        : ' · Wysłano'
                      : ''}
                  </AppText>
                </View>
                {item.status === 'failed' ? (
                  <View
                    style={{ alignSelf: 'flex-end', maxWidth: '90%', gap: 4 }}
                  >
                    <AppText variant="caption" color="textSecondary">
                      Nie udało się wysłać wiadomości. Spróbujcie ponownie.
                    </AppText>
                    <Button
                      label="Ponów wysyłanie"
                      icon="refresh"
                      variant="secondary"
                      disabled={!canSend || state.simulateSendError}
                      onPress={() =>
                        dispatch({ type: 'retry', messageId: item.id })
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
              <AppText variant="label">Ekipa jest zablokowana</AppText>
              <Button
                label="Odblokuj ekipę"
                variant="secondary"
                onPress={() =>
                  dispatch({ type: 'unblock', groupId: conversation.groupId })
                }
              />
            </View>
          ) : (
            <>
              {!canSend ? (
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={{ paddingHorizontal: 12, paddingTop: 8 }}
                >
                  Wysyłanie chwilowo niedostępne. Spróbujcie ponownie za chwilę.
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
