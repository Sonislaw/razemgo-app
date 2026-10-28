import { CollectionScreen } from '@/components/ui/collection-screen';
import { DataStatus } from '@/components/ui/data-status';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import {
  AppText,
  Button,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { IS_DEMO_MODE } from '@/constants/app';
import { DemoControls } from '@/features/messaging/demo-controls';
import {
  ConversationRow,
  InvitationCard,
} from '@/features/messaging/mailbox-list-items';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  isConversationAccepted,
  pendingReceivedCount,
  unreadCount,
} from '@/features/messaging/messaging-state';
import {
  MailboxEmpty,
  MessageSegments,
} from '@/features/messaging/messaging-ui';
import { PushPermissionCard } from '@/features/notifications/push-permission-card';
import { useTheme } from '@/hooks/use-theme';
import type {
  ContactInvitation,
  Conversation,
  InvitationDirection,
  MailboxView,
} from '@/types/messaging';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

export default function MessagesScreen() {
  const {
    state,
    dispatch,
    refresh,
    error,
    actionError,
    realtime,
    loadMoreMailbox,
    loadingMoreMailbox,
  } = useMessaging();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const theme = useTheme();
  const [demoOpen, setDemoOpen] = useState(false);
  const pending = pendingReceivedCount(state);
  const conversations = state.conversations
    .filter(
      (item) =>
        !state.blockedGroupIds.includes(item.groupId) &&
        isConversationAccepted(state, item),
    )
    .sort((a, b) => {
      const lastTime = (id: string) =>
        state.messages.filter((item) => item.conversationId === id).at(-1)
          ?.createdAt ?? '';
      return lastTime(b.id).localeCompare(lastTime(a.id));
    });
  const unread =
    state.summary?.unreadMessages ??
    conversations.reduce(
      (total, item) => total + unreadCount(state, item.id),
      0,
    );
  const invitations = state.invitations.filter(
    (item) =>
      item.direction === state.direction &&
      !state.blockedGroupIds.includes(item.groupId),
  );
  const setView = (view: MailboxView) => dispatch({ type: 'view', view });
  return (
    <>
      <CollectionScreen<Conversation | ContactInvitation>
        testID="mailbox-list"
        data={
          state.loadStatus === 'ready'
            ? state.view === 'conversations'
              ? conversations
              : invitations
            : []
        }
        renderItem={({ item }) =>
          'direction' in item ? (
            <InvitationCard invitation={item} />
          ) : (
            <ConversationRow conversation={item} />
          )
        }
        keyExtractor={(item) => item.id}
        itemGap={state.view === 'conversations' ? 0 : 12}
        onEndReached={() => {
          void loadMoreMailbox();
        }}
        header={
          <IllustratedPageHeader
            title="Wiadomości"
            description={'Rozmowy i zaproszenia\nw jednym miejscu.'}
            actions={
              <>
                <IconButton
                  label="Odśwież skrzynkę"
                  icon="refresh"
                  onPress={() => {
                    void refresh();
                  }}
                />
                {IS_DEMO_MODE ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Scenariusze demonstracyjne"
                    onPress={() => setDemoOpen(true)}
                    style={{
                      minWidth: 48,
                      minHeight: 48,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: theme.hero,
                      }}
                    >
                      <AppText variant="caption">Demo</AppText>
                    </View>
                  </Pressable>
                ) : null}
                <IconButton
                  label="Bezpieczeństwo rozmów"
                  icon="shield"
                  onPress={() => router.push('/messaging-safety')}
                />
              </>
            }
          />
        }
        beforeList={
          <View style={{ gap: 12 }}>
            <MessageSegments<MailboxView>
              value={state.view}
              options={[
                { value: 'conversations', label: 'Rozmowy', count: unread },
                { value: 'invitations', label: 'Zaproszenia', count: pending },
              ]}
              onChange={setView}
            />
            <PushPermissionCard compact />
            {actionError ? (
              <AppText accessibilityRole="alert" color="textSecondary">
                {actionError}
              </AppText>
            ) : null}
            {state.loadStatus === 'ready' && error ? (
              <DataStatus
                status="error"
                error={error}
                onRetry={() => {
                  void refresh();
                }}
              />
            ) : null}
            {state.loadStatus === 'ready' &&
            realtime === 'reconnecting' &&
            !IS_DEMO_MODE ? (
              <AppText variant="caption" color="textSecondary">
                Ponawiamy połączenie na żywo. Skrzynka odświeża się również
                okresowo.
              </AppText>
            ) : null}
            {state.loadStatus === 'loading' ? (
              <MailboxEmpty
                icon="refresh"
                title="Wczytujemy skrzynkę"
                description="To może potrwać chwilę."
              >
                <ActivityIndicator
                  color={theme.primaryStrong}
                  style={{ marginBottom: 12 }}
                />
                <Button
                  label="Odśwież skrzynkę"
                  variant="secondary"
                  onPress={() => {
                    void refresh();
                  }}
                />
              </MailboxEmpty>
            ) : state.loadStatus === 'error' ? (
              <MailboxEmpty
                icon="water"
                title="Nie udało się wczytać skrzynki"
                description="Spróbuj ponownie. Twoje wiadomości pozostają w skrzynce."
              >
                <Button
                  label="Spróbuj ponownie"
                  icon="refresh"
                  onPress={() => {
                    void refresh();
                  }}
                />
              </MailboxEmpty>
            ) : state.view === 'conversations' ? (
              <>
                {conversations.length ? (
                  <View>
                    <AppText
                      variant="caption"
                      color="textSecondary"
                      style={{ paddingVertical: 4 }}
                    >
                      Rozmowy: {conversations.length}
                    </AppText>
                  </View>
                ) : (
                  <MailboxEmpty
                    title="Jeszcze nie masz rozmów"
                    description="Poznaj podróżników i zaplanuj coś razem z nimi. Rozmowa zaczyna się po akceptacji zaproszenia."
                  >
                    <Button
                      label="Odkryj podróżników"
                      icon="compass"
                      onPress={() => router.navigate('/explore')}
                    />
                    {pending ? (
                      <Button
                        label={'Zobacz zaproszenia · ' + pending}
                        variant="secondary"
                        onPress={() =>
                          dispatch({
                            type: 'view',
                            view: 'invitations',
                            direction: 'received',
                          })
                        }
                      />
                    ) : null}
                  </MailboxEmpty>
                )}
              </>
            ) : (
              <>
                <MessageSegments<InvitationDirection>
                  subtle
                  value={state.direction}
                  options={[
                    { value: 'received', label: 'Otrzymane', count: pending },
                    { value: 'sent', label: 'Wysłane' },
                  ]}
                  onChange={(direction) =>
                    dispatch({ type: 'view', view: 'invitations', direction })
                  }
                />
                {invitations.length ? null : (
                  <MailboxEmpty
                    icon="people"
                    title={
                      state.direction === 'received'
                        ? 'Brak otrzymanych zaproszeń'
                        : 'Nie masz jeszcze wysłanych zaproszeń'
                    }
                    description={
                      state.direction === 'received'
                        ? 'Nowe prośby o kontakt pojawią się tutaj. Możesz też zrobić pierwszy krok.'
                        : 'Znajdź ciekawy wyjazd i zaproś jego ekipę do rozmowy.'
                    }
                  >
                    <Button
                      label="Odkryj podróżników"
                      icon="compass"
                      onPress={() => router.navigate('/explore')}
                    />
                  </MailboxEmpty>
                )}
              </>
            )}
          </View>
        }
        afterList={
          <View style={{ gap: 12 }}>
            {loadingMoreMailbox ? (
              <ActivityIndicator
                accessibilityLabel="Wczytywanie skrzynki"
                color={theme.primaryStrong}
              />
            ) : null}
            <View
              style={[
                layout.row,
                { alignItems: 'flex-start', paddingVertical: 8 },
              ]}
            >
              <Icon name="lock" size={16} />
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ flex: 1 }}
              >
                Kontakt wyłącznie między dorosłymi, po akceptacji zaproszenia.
                {IS_DEMO_MODE
                  ? ' Fikcyjne osoby i wiadomości · zmiany tylko w tej sesji.'
                  : ''}
              </AppText>
            </View>
          </View>
        }
      />
      {demoOpen ? <DemoControls onClose={() => setDemoOpen(false)} /> : null}
    </>
  );
}
