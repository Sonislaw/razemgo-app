import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton, layout } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { AVAILABLE_PROPOSALS } from '@/data/proposals';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  discoveryFiltersForTrip,
  todayDate,
} from '@/features/trips/own-trips-state';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from './notifications-context';
import {
  notificationQuantity,
  selectHomeNotifications,
  type NotificationSummary,
} from './notification-state';

function NotificationRow({
  id,
  title,
  description,
  summary,
  icon,
  onPress,
}: {
  id: string;
  title: string;
  description: string;
  summary: NotificationSummary;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={'notification-' + id}
      accessibilityRole="button"
      accessibilityLabel={`${summary.unread ? 'Nieodczytane. ' : ''}${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        {
          minHeight: 80,
          padding: 12,
          gap: 10,
          borderRadius: 16,
          backgroundColor: summary.unread
            ? theme.backgroundSelected
            : theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.iconBackground }]}>
        <Icon name={icon} size={21} color={theme.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <AppText
          testID={'notification-title-' + id}
          variant="label"
          style={{ fontWeight: summary.unread ? '700' : '400' }}
        >
          {title}
        </AppText>
        <AppText
          variant="caption"
          color="textSecondary"
          numberOfLines={3}
          style={{ fontWeight: summary.unread ? '700' : '400' }}
        >
          {description}
        </AppText>
      </View>
      {summary.unread ? (
        <View
          style={[
            styles.unreadDot,
            { backgroundColor: theme.notificationBackground },
          ]}
        />
      ) : (
        <Icon name="chevron" size={16} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

export function HomeNotifications() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { state: ownTrips } = useOwnTrips();
  const { state: mailbox, dispatch } = useMessaging();
  const { setFilters, setSort } = useDiscovery();
  const { readKeys, markRead } = useNotifications();
  const notifications = selectHomeNotifications(
    AVAILABLE_PROPOSALS,
    ownTrips.trips,
    mailbox,
    readKeys,
    todayDate(),
  );
  const trigger = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const popoverWidth = Math.min(344, width - insets.left - insets.right - 32);
  const left = Math.max(
    insets.left + 16,
    Math.min(
      (anchor?.x ?? width) + (anchor?.width ?? 0) - popoverWidth,
      width - insets.right - popoverWidth - 16,
    ),
  );
  const top = Math.max(
    insets.top + 8,
    (anchor?.y ?? insets.top) + (anchor?.height ?? 48) + 12,
  );
  const arrowLeft = Math.max(
    16,
    Math.min(
      popoverWidth - 28,
      (anchor?.x ?? 0) + (anchor?.width ?? 48) / 2 - left - 6,
    ),
  );
  const { suggestions, invitations, messages } = notifications;
  const suggestionDescription =
    suggestions.count && suggestions.trip
      ? `${notificationQuantity(suggestions.count, 'proposals')} do ogłoszenia „${getTripHeadline(suggestions.trip)}”`
      : suggestions.trip
        ? 'Na razie brak nowych propozycji. Sprawdź kryteria swojego ogłoszenia.'
        : 'Dodaj ogłoszenie, aby otrzymywać propozycje wspólnego wyjazdu.';
  const invitationDescription =
    mailbox.loadStatus !== 'ready'
      ? 'Sprawdź zaproszenia w Wiadomościach.'
      : invitations.count
        ? `${notificationQuantity(invitations.count, 'invitations')} — sprawdź, kto chce Cię poznać.`
        : 'Nie masz oczekujących zaproszeń do kontaktu.';
  const messageGroup = AVAILABLE_PROPOSALS.find(
    ({ group }) => group.id === messages.conversation?.groupId,
  )?.group;
  const messageDescription =
    mailbox.loadStatus !== 'ready'
      ? 'Sprawdź rozmowy w Wiadomościach.'
      : messages.count
        ? `Nieodczytane: ${notificationQuantity(messages.count, 'messages')}.${messageGroup ? ' Rozmowa z ekipą „' + messageGroup.name + '”.' : ''}`
        : 'Nie masz nieodczytanych wiadomości.';

  return (
    <>
      <View ref={trigger} collapsable={false}>
        <Pressable
          testID="home-notifications-bell"
          accessibilityRole="button"
          accessibilityLabel={`Powiadomienia${notifications.unreadCount ? ', nieodczytane: ' + notifications.unreadCount : ''}`}
          accessibilityState={{ expanded: open }}
          onPress={() =>
            trigger.current?.measureInWindow(
              (x, y, measuredWidth, measuredHeight) => {
                setAnchor({
                  x,
                  y,
                  width: measuredWidth,
                  height: measuredHeight,
                });
                setOpen(true);
              },
            )
          }
          style={({ pressed }) => [
            styles.bell,
            {
              backgroundColor: theme.iconBackground,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name="bell" size={24} color={theme.textSecondary} />
          {notifications.unreadCount ? (
            <View aria-hidden style={styles.badge}>
              <CountBadge count={notifications.unreadCount} />
            </View>
          ) : null}
        </Pressable>
      </View>
      {open ? (
        <Modal
          transparent
          visible
          animationType="fade"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={close}
        >
          <View style={styles.overlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zamknij powiadomienia"
              onPress={close}
              style={StyleSheet.absoluteFill}
            />
            <View
              testID="home-notifications-popover"
              role="dialog"
              accessibilityLabel="Powiadomienia"
              accessibilityViewIsModal
              aria-modal
              onAccessibilityEscape={close}
              style={[
                styles.popover,
                {
                  left,
                  top,
                  width: popoverWidth,
                  maxHeight: Math.max(80, height - insets.bottom - top - 16),
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  boxShadow: `0 6px 24px ${theme.scrim}`,
                },
              ]}
            >
              <View
                style={[
                  styles.pointer,
                  {
                    left: arrowLeft,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              />
              <View style={[layout.row, styles.popoverHeader]}>
                <AppText
                  variant="heading"
                  accessibilityRole="header"
                  style={{ flex: 1, fontSize: 18 }}
                >
                  Powiadomienia
                </AppText>
                <IconButton
                  label="Zamknij dymek"
                  icon="close"
                  onPress={close}
                />
              </View>
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{
                  padding: 8,
                  gap: 4,
                  paddingBottom: 12,
                }}
              >
                <NotificationRow
                  id="proposals"
                  title="Propozycje do ogłoszenia"
                  description={suggestionDescription}
                  summary={suggestions}
                  icon="compass"
                  onPress={() => {
                    markRead(suggestions.keys);
                    close();
                    if (suggestions.trip) {
                      setFilters(discoveryFiltersForTrip(suggestions.trip));
                      setSort('compatibility');
                      router.navigate('/explore');
                    } else router.navigate('/trips');
                  }}
                />
                <NotificationRow
                  id="invitations"
                  title="Zaproszenia do kontaktu"
                  description={invitationDescription}
                  summary={invitations}
                  icon="campfire-chat"
                  onPress={() => {
                    markRead(invitations.keys);
                    dispatch({
                      type: 'view',
                      view: 'invitations',
                      direction: 'received',
                    });
                    close();
                    router.navigate('/messages');
                  }}
                />
                <NotificationRow
                  id="messages"
                  title="Nowe wiadomości"
                  description={messageDescription}
                  summary={messages}
                  icon="campfire-chat"
                  onPress={() => {
                    dispatch({ type: 'view', view: 'conversations' });
                    close();
                    if (messages.conversation) {
                      router.push({
                        pathname: '/chat/[id]',
                        params: { id: messages.conversation.id },
                      });
                    } else router.navigate('/messages');
                  }}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', top: -3, right: -3 },
  overlay: { flex: 1 },
  popover: { position: 'absolute', borderRadius: 20, borderWidth: 1 },
  pointer: {
    position: 'absolute',
    top: -7,
    width: 12,
    height: 12,
    transform: [{ rotate: '45deg' }],
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  popoverHeader: { paddingLeft: 16, paddingRight: 8, paddingTop: 8, gap: 8 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
