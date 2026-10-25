import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { DataStatus } from '@/components/ui/data-status';
import { DemoControls } from '@/features/messaging/demo-controls';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  formatMessageDate,
  formatMessageTime,
  isConversationAccepted,
  pendingReceivedCount,
  unreadCount,
} from '@/features/messaging/messaging-state';
import {
  CountBadge,
  GroupAvatar,
  MailboxEmpty,
  MessageSegments,
} from '@/features/messaging/messaging-ui';
import { useTheme } from '@/hooks/use-theme';
import { PushPermissionCard } from '@/features/notifications/push-permission-card';
import { crewNumberText } from '@/features/profile/crew-number';
import type {
  ContactInvitation,
  Conversation,
  InvitationDirection,
  MailboxView,
} from '@/types/messaging';

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const { state, contact, trip } = useMessaging();
  const theme = useTheme();
  const group = contact(conversation.groupId);
  const plan = trip(conversation.tripId);
  const messages = state.messages.filter(
    (item) => item.conversationId === conversation.id,
  );
  const last = messages[messages.length - 1];
  const unread = unreadCount(state, conversation.id);
  if (!group) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        group.name +
        ', ' +
        (plan ? getTripHeadline(plan) : 'Kontakt z profilu') +
        (unread ? ', nieprzeczytane: ' + unread : '')
      }
      onPress={() =>
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })
      }
      style={({ pressed }) => [
        styles.conversation,
        {
          borderBottomColor: theme.border,
          backgroundColor: pressed ? theme.muted : 'transparent',
        },
      ]}
    >
      <GroupAvatar groupId={conversation.groupId} avatarId={group.avatarId} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={layout.row}>
          <AppText
            variant="label"
            numberOfLines={1}
            style={{ flex: 1, fontWeight: unread ? '700' : '600' }}
          >
            {group.name}
          </AppText>
          {last ? (
            <AppText variant="caption" color="textSecondary">
              {last.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
                ? formatMessageTime(last.createdAt)
                : formatMessageDate(last.createdAt).replace(' 2027', '')}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" color="primaryStrong" numberOfLines={1}>
          {crewNumberText(group.crewNumber) ? crewNumberText(group.crewNumber) + ' · ' : ''}
          {plan ? getTripHeadline(plan) : 'Kontakt z profilu'}
        </AppText>
        <View style={layout.row}>
          <AppText
            variant="label"
            color={unread ? 'text' : 'textSecondary'}
            numberOfLines={1}
            style={{ flex: 1, fontWeight: unread ? '600' : '400' }}
          >
            {last
              ? (last.status === 'failed'
                  ? 'Niewysłana: '
                  : last.sender === 'self'
                    ? 'Ty: '
                    : '') + last.text
              : 'Napisz pierwsze „cześć”!'}
          </AppText>
          <CountBadge count={unread} />
        </View>
      </View>
    </Pressable>
  );
}

function InvitationCard({ invitation }: { invitation: ContactInvitation }) {
  const { state, respond, contact, trip, busy } = useMessaging();
  const theme = useTheme();
  const group = contact(invitation.groupId);
  const plan = trip(invitation.tripId);
  if (!group) return null;
  const incoming = invitation.direction === 'received';
  const pending = invitation.status === 'pending';
  const labels = {
    pending: incoming ? 'Nowe' : 'Oczekuje',
    accepted: 'Zaakceptowane',
    declined: 'Odrzucone',
    withdrawn: 'Wycofane',
  };
  const conversation = state.conversations.find(
    (item) => item.invitationId === invitation.id,
  );
  return (
    <Card style={{ gap: 12 }}>
      <View
        style={[
          layout.row,
          { justifyContent: 'space-between', flexWrap: 'wrap' },
        ]}
      >
        <AppText variant="caption" color="textSecondary">
          {formatMessageDate(invitation.createdAt)}
        </AppText>
        <View
          style={{
            backgroundColor:
              pending && incoming ? theme.positiveBackground : theme.muted,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
          }}
        >
          <AppText
            variant="caption"
            color={pending && incoming ? 'positive' : 'textSecondary'}
          >
            {labels[invitation.status]}
          </AppText>
        </View>
      </View>
      <View style={layout.row}>
        <GroupAvatar groupId={invitation.groupId} avatarId={group.avatarId} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontSize: 16 }}>
            {group.name}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {crewNumberText(group.crewNumber) ? crewNumberText(group.crewNumber) + ' · ' : ''}
            {group.adultCount}{' '}
            {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={plan ? 'Zobacz wyjazd: ' + getTripHeadline(plan) : 'Zobacz profil: ' + group.name}
        onPress={() =>
          router.push({
            pathname: plan ? incoming ? '/trips/[id]' : '/trip/[id]' : '/crew/[id]',
            params: { id: plan ? plan.id : group.id },
          })
        }
        style={[
          layout.row,
          {
            minHeight: 48,
            padding: 8,
            backgroundColor: theme.muted,
            borderRadius: 12,
          },
        ]}
      >
        <Icon name={plan ? 'trips' : 'people'} size={18} />
        <AppText variant="caption" color="primaryStrong" style={{ flex: 1 }}>
          {plan ? getTripHeadline(plan) : 'Kontakt z profilu · zobacz ekipę'}
        </AppText>
        <Icon name="chevron" size={16} />
      </Pressable>
      <AppText style={{ fontSize: 14, lineHeight: 21 }}>
        {invitation.text}
      </AppText>
      {pending && incoming ? (
        <View style={[layout.row, { alignItems: 'stretch', flexWrap: 'wrap' }]}>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Button
              label="Odrzuć"
              disabled={busy}
              variant="secondary"
              onPress={() =>
                void respond(invitation.id, 'declined')
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Button
              label="Akceptuj"
              disabled={busy}
              icon="check"
              onPress={() =>
                void respond(invitation.id, 'accepted')
              }
            />
          </View>
        </View>
      ) : pending ? (
        <View style={{ gap: 8 }}>
          <AppText variant="caption" color="textSecondary">
            Rozmowa pojawi się po akceptacji drugiej ekipy.
          </AppText>
          <Button
            label="Wycofaj zaproszenie"
            disabled={busy}
            variant="secondary"
            onPress={() =>
              void respond(invitation.id, 'withdrawn')
            }
          />
        </View>
      ) : conversation ? (
        <Button
          label="Przejdź do rozmowy"
          icon="chat"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/chat/[id]',
              params: { id: conversation.id },
            })
          }
        />
      ) : (
        <AppText variant="caption" color="textSecondary">
          {invitation.status === 'declined'
            ? 'Zaproszenie zamknięte. Rozmowa nie została rozpoczęta.'
            : 'Zaproszenie zostało wycofane.'}
        </AppText>
      )}
    </Card>
  );
}

export default function MessagesScreen() {
  const { state, dispatch, refresh, error, actionError, realtime } = useMessaging();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
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
  const unread = conversations.reduce(
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
      <Screen
        header={
          <IllustratedPageHeader
            title="Wiadomości"
            description={'Rozmowy i zaproszenia\nw jednym miejscu.'}
            actions={
              <>
                <IconButton label="Odśwież skrzynkę" icon="refresh" onPress={() => { void refresh(); }} />
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
      >
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
          {actionError ? <AppText accessibilityRole="alert" color="textSecondary">{actionError}</AppText> : null}
          {state.loadStatus === 'ready' && error ? <DataStatus status="error" error={error} onRetry={() => { void refresh(); }} /> : null}
          {state.loadStatus === 'ready' && realtime === 'reconnecting' && !IS_DEMO_MODE ? (
            <AppText variant="caption" color="textSecondary">Ponawiamy połączenie na żywo. Skrzynka odświeża się również okresowo.</AppText>
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
                onPress={() => { void refresh(); }}
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
                onPress={() => { void refresh(); }}
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
                  {conversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                    />
                  ))}
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
              {invitations.length ? (
                <View style={{ gap: 12 }}>
                  {invitations.map((invitation) => (
                    <InvitationCard
                      key={invitation.id}
                      invitation={invitation}
                    />
                  ))}
                </View>
              ) : (
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
      </Screen>
      {demoOpen ? <DemoControls onClose={() => setDemoOpen(false)} /> : null}
    </>
  );
}
const styles = StyleSheet.create({
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
