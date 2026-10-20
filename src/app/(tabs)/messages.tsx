import { getTripHeadline } from '@/features/trips/trip-headline';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  IconButton,
  PageHeader,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IS_DEMO_MODE } from '@/constants/app';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
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
import type {
  ContactInvitation,
  Conversation,
  InvitationDirection,
  MailboxView,
} from '@/types/messaging';

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const { state } = useMessaging();
  const theme = useTheme();
  const proposal = DEMO_PROPOSALS.find(
    (item) => item.trip.id === conversation.tripId,
  );
  const messages = state.messages.filter(
    (item) => item.conversationId === conversation.id,
  );
  const last = messages[messages.length - 1];
  const unread = unreadCount(state, conversation.id);
  if (!proposal) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        proposal.group.name +
        ', ' +
        getTripHeadline(proposal.trip) +
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
      <GroupAvatar groupId={conversation.groupId} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={layout.row}>
          <AppText
            variant="label"
            numberOfLines={1}
            style={{ flex: 1, fontWeight: unread ? '700' : '600' }}
          >
            {proposal.group.name}
          </AppText>
          {last ? (
            <AppText variant="caption" color="textSecondary">
              {last.createdAt.slice(0, 10) === '2027-05-18'
                ? formatMessageTime(last.createdAt)
                : formatMessageDate(last.createdAt).replace(' 2027', '')}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" color="primaryStrong" numberOfLines={1}>
          {getTripHeadline(proposal.trip)}
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
                    ? 'Wy: '
                    : '') + last.text
              : 'Napiszcie pierwsze „cześć”!'}
          </AppText>
          <CountBadge count={unread} />
        </View>
      </View>
    </Pressable>
  );
}

function InvitationCard({ invitation }: { invitation: ContactInvitation }) {
  const { state, dispatch } = useMessaging();
  const theme = useTheme();
  const proposal = DEMO_PROPOSALS.find(
    (item) => item.trip.id === invitation.tripId,
  );
  if (!proposal) return null;
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
        <GroupAvatar groupId={invitation.groupId} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontSize: 16 }}>
            {proposal.group.name}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {proposal.group.adultCount}{' '}
            {proposal.group.adultCount === 1 ? 'dorosły' : 'dorosłych'} ·
            kontakt między dorosłymi
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Zobacz wyjazd: ' + getTripHeadline(proposal.trip)}
        onPress={() =>
          router.push({
            pathname: '/trip/[id]',
            params: { id: invitation.tripId },
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
        <Icon name="trips" size={18} />
        <AppText variant="caption" color="primaryStrong" style={{ flex: 1 }}>
          {getTripHeadline(proposal.trip)}
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
              variant="secondary"
              onPress={() =>
                dispatch({ type: 'decline', invitationId: invitation.id })
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Button
              label="Akceptuj"
              icon="check"
              onPress={() =>
                dispatch({ type: 'accept', invitationId: invitation.id })
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
            variant="secondary"
            onPress={() =>
              dispatch({ type: 'withdraw', invitationId: invitation.id })
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
  const { state, dispatch } = useMessaging();
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
      <Screen>
        <View style={{ gap: 12 }}>
          <PageHeader
            title="Wiadomości"
            actions={
              <>
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
          <MessageSegments<MailboxView>
            value={state.view}
            options={[
              { value: 'conversations', label: 'Rozmowy', count: unread },
              { value: 'invitations', label: 'Zaproszenia', count: pending },
            ]}
            onChange={setView}
          />
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
                onPress={() => dispatch({ type: 'ready' })}
              />
            </MailboxEmpty>
          ) : state.loadStatus === 'error' ? (
            <MailboxEmpty
              icon="water"
              title="Nie udało się wczytać skrzynki"
              description="Spróbujcie ponownie. Wasze wiadomości pozostają w skrzynce."
            >
              <Button
                label="Spróbuj ponownie"
                icon="refresh"
                onPress={() => dispatch({ type: 'ready' })}
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
                  title="Jeszcze nie macie rozmów"
                  description="Poznajcie podróżników i zaplanujcie coś razem. Rozmowa zaczyna się po akceptacji zaproszenia."
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
                      : 'Jeszcze nie wysłaliście zaproszeń'
                  }
                  description={
                    state.direction === 'received'
                      ? 'Nowe prośby o kontakt pojawią się tutaj. Sami też możecie zrobić pierwszy krok.'
                      : 'Znajdźcie ciekawy wyjazd i zaproście jego ekipę do rozmowy.'
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
