import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { AppText, Button, Card, layout } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { USE_DEMO_DATA } from '@/constants/app';
import { useMessaging } from '@/features/messaging/messaging-context';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { useNotifications } from './notifications-context';
import { notificationTitle, type NotificationEntry } from './notification-types';
import { isReactionKind, reactionOption } from '@/features/reactions/reaction-data';

export function NotificationEntryRow({ entry, onOpen, compact = false }: {
  entry: NotificationEntry; onOpen?: () => void; compact?: boolean;
}) {
  const theme = useTheme();
  const inbox = useNotifications();
  const { dispatch } = useMessaging();
  const title = notificationTitle(entry.kind);
  const reaction = isReactionKind(entry.reaction_kind) ? reactionOption(entry.reaction_kind) : null;
  const reactionLabel = entry.kind === 'trip_reaction' ? entry.reaction_active === false ? 'Reakcja została cofnięta.'
    : reaction ? `Reakcja: ${reaction.emoji} ${reaction.label}` : 'Reakcja na ogłoszenie' : '';
  const open = async () => {
    if (!entry.read_at && !(await inbox.read([entry.id]))) return;
    onOpen?.();
    if (!entry.available) return;
    if (entry.kind === 'trip_reaction' && entry.proposed_trip_id) {
      router.push({ pathname: '/trips/[id]', params: { id: entry.proposed_trip_id } });
    } else if ((entry.kind === 'proposal' || entry.kind === 'favorite_trip') && entry.proposed_trip_id) {
      router.push({ pathname: '/trip/[id]', params: { id: entry.proposed_trip_id } });
    } else if (entry.conversation_id) {
      router.push({ pathname: '/chat/[id]', params: { id: entry.conversation_id } });
    } else {
      dispatch({ type: 'view', view: 'invitations', direction: 'received' });
      router.navigate('/messages');
    }
  };
  return <Pressable
    testID={'notification-entry-' + entry.id}
    accessibilityRole="button"
    accessibilityLabel={`${entry.read_at ? '' : 'Nieodczytane. '}${title}. ${entry.actor_name}. ${reactionLabel} ${entry.trip_label}${entry.available ? '' : '. Treść jest już niedostępna.'}`}
    disabled={inbox.busy}
    onPress={() => { void open(); }}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: compact ? 12 : 16,
      minHeight: 80, borderRadius: 20, borderWidth: compact ? 0 : 1, borderColor: theme.border,
      backgroundColor: entry.read_at ? theme.backgroundElement : theme.backgroundSelected, opacity: pressed ? 0.7 : 1 })}
  >
    <GroupAvatar groupId={entry.actor_group_id} avatarId={entry.actor_avatar_id} size={compact ? 36 : 44} decorative />
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <AppText variant="label" style={{ fontWeight: entry.read_at ? '400' : '700' }}>{title}</AppText>
      {reactionLabel ? <AppText variant="caption" color="primaryStrong">{reactionLabel}</AppText> : null}
      <AppText variant="caption" color="textSecondary" numberOfLines={compact ? 2 : 3}>
        {entry.actor_name}{entry.trip_label ? ' · ' + entry.trip_label : ''}
      </AppText>
      {!entry.available ? <AppText variant="caption" color="textSecondary">Treść jest już niedostępna.</AppText> : null}
      {!compact ? <AppText variant="caption" color="textSecondary">
        {new Date(entry.created_at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </AppText> : null}
    </View>
    {!entry.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: theme.notificationBackground }} /> : null}
  </Pressable>;
}

export function NotificationFeedback() {
  const inbox = useNotifications();
  return <>
    {inbox.error ? <Card style={{ gap: 8 }}>
      <AppText variant="caption" accessibilityRole="alert">{inbox.error}</AppText>
      <Button label="Odśwież powiadomienia" variant="secondary" onPress={() => { void inbox.refresh(); }} />
    </Card> : null}
    {inbox.actionError ? <AppText variant="caption" accessibilityRole="alert">{inbox.actionError}</AppText> : null}
  </>;
}

export function NotificationPreferencesCard() {
  const inbox = useNotifications();
  const theme = useTheme();
  if (USE_DEMO_DATA) return null;
  return <Card style={{ gap: 12 }}>
    <AppText variant="label" accessibilityRole="header">Jakie powiadomienia chcesz otrzymywać?</AppText>
    <AppText variant="caption" color="textSecondary">
      Ustawienia dotyczą wszystkich Twoich telefonów. Historia powiadomień w aplikacji jest dostępna także po wyłączeniu push.
    </AppText>
    {inbox.status === 'loading' ? <ActivityIndicator accessibilityLabel="Wczytywanie ustawień powiadomień" color={theme.primaryStrong} /> : null}
    {inbox.status === 'ready' ? <>
      {([
        ['messages', 'Wiadomości', 'Nowa wiadomość w rozmowie.', inbox.preferences.push_messages],
        ['invitations', 'Zaproszenia', 'Nowe zaproszenie oraz akceptacja wysłanego zaproszenia.', inbox.preferences.push_invitations],
        ['favorite_trips', 'Wyjazdy ulubionych ekip', 'Nowe ogłoszenia ekip dodanych do ulubionych.', inbox.preferences.push_favorite_trips],
        ['reactions', 'Reakcje na ogłoszenia', 'Nowa emocja pozostawiona pod Twoim ogłoszeniem.', inbox.preferences.push_reactions],
      ] as const).map(([key, title, description, enabled]) => <View key={key} style={[layout.row, { minHeight: 56 }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="label">{title}</AppText>
          <AppText variant="caption" color="textSecondary">{description}</AppText>
        </View>
        <Switch accessibilityLabel={'Push: ' + title} value={enabled} disabled={inbox.busy || !!inbox.error}
          trackColor={{ false: theme.border, true: theme.primaryStrong }}
          onValueChange={value => { void inbox.savePreference(key, value); }} />
      </View>)}
      {inbox.busy ? <AppText variant="caption" accessibilityLiveRegion="polite">Zapisywanie…</AppText> : null}
    </> : null}
    <NotificationFeedback />
    <Button label="Historia powiadomień" variant="secondary" icon="bell" onPress={() => { inbox.setUnreadOnly(false); router.push('/notifications'); }} />
  </Card>;
}
