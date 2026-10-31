import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AppText, Button, EmptyState, Screen, layout } from '@/components/ui/primitives';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { MessageSegments } from '@/features/messaging/messaging-ui';
import { useNotifications } from '@/features/notifications/notifications-context';
import { NotificationEntryRow, NotificationFeedback } from '@/features/notifications/notification-ui';
import { useTheme } from '@/hooks/use-theme';

export default function NotificationsScreen() {
  const inbox = useNotifications();
  const theme = useTheme();
  return <Screen>
    <View style={{ gap: 12 }}>
      <ProfileSubpageHeader title="Powiadomienia" backLabel="Wróć na Start" onBack={() => router.dismissTo('/')} />
      <MessageSegments value={inbox.unreadOnly ? 'unread' : 'all'}
        options={[{ value: 'all', label: 'Wszystkie' }, { value: 'unread', label: 'Nieodczytane', count: inbox.unreadCount }]}
        onChange={value => inbox.setUnreadOnly(value === 'unread')} />
      <View style={[layout.row, { flexWrap: 'wrap' }]}>
        <Button label="Odśwież" icon="refresh" variant="secondary" disabled={inbox.busy} onPress={() => { void inbox.refresh(); }} />
        <Button label="Oznacz wszystkie jako odczytane" variant="secondary"
          disabled={inbox.busy || !inbox.unreadCount || inbox.status !== 'ready'} onPress={() => { void inbox.readAll(); }} />
      </View>
      <NotificationFeedback />
      {inbox.status === 'loading' ? <ActivityIndicator accessibilityLabel="Wczytywanie powiadomień" color={theme.primaryStrong} /> : null}
      {inbox.status === 'ready' && !inbox.items.length && !inbox.error ? <EmptyState icon="bell"
        title={inbox.unreadOnly ? 'Wszystko odczytane' : 'Jeszcze nie masz powiadomień'}
        description={inbox.unreadOnly ? 'Nowe powiadomienia pojawią się tutaj.' : 'Tutaj znajdziesz wiadomości, zaproszenia i propozycje do swoich ogłoszeń.'} /> : null}
      {inbox.items.map(entry => <NotificationEntryRow key={entry.id} entry={entry} />)}
      {inbox.hasMore ? <LoadMoreButton label="Wczytaj starsze powiadomienia" loading={inbox.loadingMore}
        disabled={inbox.busy} onPress={() => { void inbox.loadMore(); }} /> : null}
      <AppText variant="caption" color="textSecondary">Odczyt powiadomienia nie oznacza odczytania wiadomości w rozmowie.</AppText>
    </View>
  </Screen>;
}
