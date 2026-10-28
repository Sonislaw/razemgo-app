import { Icon } from '@/components/ui/icon';
import { AppText, Button, Card, layout } from '@/components/ui/primitives';
import { useMessagingSelector } from '@/features/messaging/messaging-context';
import {
  formatMessageDate,
  formatMessageTime,
  unreadCount,
} from '@/features/messaging/messaging-state';
import { CountBadge, GroupAvatar } from '@/features/messaging/messaging-ui';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import type { ContactInvitation, Conversation } from '@/types/messaging';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export const ConversationRow = memo(function ConversationRow({
  conversation,
}: {
  conversation: Conversation;
}) {
  const { group, plan, last, unread } = useMessagingSelector(
    ({ state, contact, trip }) => ({
      group: contact(conversation.groupId),
      plan: trip(conversation.tripId),
      last: state.messages
        .filter((item) => item.conversationId === conversation.id)
        .at(-1),
      unread: unreadCount(state, conversation.id),
    }),
  );
  const theme = useTheme();
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
              {last.createdAt.slice(0, 10) ===
              new Date().toISOString().slice(0, 10)
                ? formatMessageTime(last.createdAt)
                : formatMessageDate(last.createdAt).replace(' 2027', '')}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" color="primaryStrong" numberOfLines={1}>
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
});

export const InvitationCard = memo(function InvitationCard({
  invitation,
}: {
  invitation: ContactInvitation;
}) {
  const { group, plan, conversation, respond, busy } = useMessagingSelector(
    ({ state, respond, busy, contact, trip }) => ({
      group: contact(invitation.groupId),
      plan: trip(invitation.tripId),
      conversation: state.conversations.find(
        (item) => item.invitationId === invitation.id,
      ),
      respond,
      busy,
    }),
  );
  const theme = useTheme();
  if (!group) return null;
  const incoming = invitation.direction === 'received';
  const pending = invitation.status === 'pending';
  const labels = {
    pending: incoming ? 'Nowe' : 'Oczekuje',
    accepted: 'Zaakceptowane',
    declined: 'Odrzucone',
    withdrawn: 'Wycofane',
  };
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
            {group.adultCount}{' '}
            {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          plan
            ? 'Zobacz wyjazd: ' + getTripHeadline(plan)
            : 'Zobacz profil: ' + group.name
        }
        onPress={() =>
          router.push({
            pathname: plan
              ? incoming
                ? '/trips/[id]'
                : '/trip/[id]'
              : '/crew/[id]',
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
              onPress={() => void respond(invitation.id, 'declined')}
            />
          </View>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Button
              label="Akceptuj"
              disabled={busy}
              icon="check"
              onPress={() => void respond(invitation.id, 'accepted')}
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
            onPress={() => void respond(invitation.id, 'withdrawn')}
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
});
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
