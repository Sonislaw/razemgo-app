import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, IconButton, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from './notifications-context';
import { NotificationEntryRow, NotificationFeedback } from './notification-ui';

export function NotificationBell() {
  const inbox = useNotifications();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number }>();
  const [open, setOpen] = useState(false);
  const popoverWidth = Math.min(360, width - insets.left - insets.right - 32);
  const left = Math.max(insets.left + 16, Math.min((anchor?.x ?? width) + (anchor?.width ?? 0) - popoverWidth, width - insets.right - popoverWidth - 16));
  const top = Math.max(insets.top + 8, (anchor?.y ?? insets.top) + (anchor?.height ?? 48) + 12);
  const close = () => setOpen(false);
  return <>
    <View ref={trigger} collapsable={false}>
      <Pressable testID="home-notifications-bell" accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={'Powiadomienia' + (inbox.unreadCount ? ', nieodczytane: ' + inbox.unreadCount : '')}
        onPress={() => { inbox.setUnreadOnly(false); trigger.current?.measureInWindow((x,y,w,h) => { setAnchor({ x,y,width:w,height:h }); setOpen(true); void inbox.refresh(); }); }}
        style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24,
          backgroundColor: theme.iconBackground, opacity: pressed ? 0.7 : 1 })}>
        <Icon name="bell" size={24} color={theme.textSecondary} />
        {inbox.unreadCount ? <View aria-hidden style={{ position: 'absolute', top: -3, right: -3 }}><CountBadge count={inbox.unreadCount} /></View> : null}
      </Pressable>
    </View>
    {open ? <Modal transparent visible animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Zamknij powiadomienia" onPress={close} style={{ position: 'absolute', inset: 0 }} />
        <View testID="home-notifications-popover" role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel="Powiadomienia"
          onAccessibilityEscape={close} style={{ position: 'absolute', left, top, width: popoverWidth,
            maxHeight: Math.max(100, height - insets.bottom - top - 16), borderRadius: 20, borderWidth: 1,
            borderColor: theme.border, backgroundColor: theme.backgroundElement, boxShadow: `0 6px 24px ${theme.scrim}` }}>
          <View style={[layout.row, { paddingLeft: 16, paddingRight: 8, paddingTop: 8 }]}>
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1, fontSize: 18 }}>Powiadomienia</AppText>
            <IconButton icon="close" label="Zamknij dymek" onPress={close} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 8, gap: 4, paddingBottom: Math.max(12, insets.bottom) }}>
            <NotificationFeedback />
            {inbox.status === 'loading' ? <ActivityIndicator accessibilityLabel="Wczytywanie powiadomień" color={theme.primaryStrong} /> : null}
            {inbox.status === 'ready' && !inbox.items.length && !inbox.error ? <AppText variant="caption" style={{ padding: 12 }}>Nie masz nowych powiadomień.</AppText> : null}
            {inbox.items.slice(0, 3).map(entry => <NotificationEntryRow key={entry.id} entry={entry} compact onOpen={close} />)}
            <Button label="Zobacz wszystkie powiadomienia" variant="secondary" onPress={() => { close(); inbox.setUnreadOnly(false); router.push('/notifications'); }} />
          </ScrollView>
        </View>
      </View>
    </Modal> : null}
  </>;
}
