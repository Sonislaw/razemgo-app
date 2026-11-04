import { router, useIsFocused } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AppText, Button, EmptyState, Screen, layout } from '@/components/ui/primitives';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { MessageSegments } from '@/features/messaging/messaging-ui';
import { useNotifications } from '@/features/notifications/notifications-context';
import { NotificationEntryRow, NotificationFeedback } from '@/features/notifications/notification-ui';
import { useTheme } from '@/hooks/use-theme';

export default function NotificationsScreen() {
  const inbox = useNotifications();
  const theme = useTheme();
  const focused = useIsFocused();
  const pagination = {itemCount:inbox.items.length,hasMore:inbox.hasMore,loading:inbox.loadingMore,
    disabled:inbox.busy||inbox.status==='loading',enabled:focused,error:inbox.error,resetKey:inbox.unreadOnly,
    loadingLabel:'Wczytywanie starszych powiadomień…',onLoadMore:inbox.loadMore};
  return <Screen pagination={pagination} testID="notification-list">
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
      <NotificationFeedback hideLoadError={inbox.items.length>0 && inbox.hasMore} />
      {inbox.status === 'loading' ? <ActivityIndicator accessibilityLabel="Wczytywanie powiadomień" color={theme.primaryStrong} /> : null}
      {inbox.status === 'ready' && !inbox.items.length && !inbox.error ? <EmptyState icon="bell"
        title={inbox.unreadOnly ? 'Wszystko odczytane' : 'Jeszcze nie masz powiadomień'}
        description={inbox.unreadOnly ? 'Nowe powiadomienia pojawią się tutaj.' : 'Tutaj znajdziesz wiadomości, zaproszenia i propozycje do swoich ogłoszeń.'} /> : null}
      {inbox.items.map(entry => <NotificationEntryRow key={entry.id} entry={entry} />)}
      <PaginationFooter pagination={pagination} />
      <AppText variant="caption" color="textSecondary">Odczyt powiadomienia nie oznacza odczytania wiadomości w rozmowie.</AppText>
    </View>
  </Screen>;
}
