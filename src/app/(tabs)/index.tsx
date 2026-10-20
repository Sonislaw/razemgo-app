import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IS_DEMO_MODE } from '@/constants/app';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  notificationCount,
  pendingReceivedCount,
  unreadCount,
} from '@/features/messaging/messaging-state';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { ActivityPreview, HomeAction } from '@/features/home/home-ui';

export default function HomeScreen() {
  const theme = useTheme();
  const { profile, hasProfile } = useProfile();
  const { state: mailbox, dispatch: dispatchMessages } = useMessaging();
  const { setFilters } = useDiscovery();
  const [demoOpen, setDemoOpen] = useState(false);
  const pending =
    mailbox.loadStatus === 'ready' ? pendingReceivedCount(mailbox) : 0;
  const unread =
    mailbox.loadStatus === 'ready'
      ? mailbox.conversations.reduce(
          (count, conversation) =>
            count + unreadCount(mailbox, conversation.id),
          0,
        )
      : 0;
  const total = notificationCount(mailbox);
  const openMessages = (view: 'conversations' | 'invitations') => {
    dispatchMessages({ type: 'view', view, direction: 'received' });
    router.navigate('/messages');
  };
  const discover = () => {
    setFilters({ ...INITIAL_FILTERS });
    router.navigate('/explore');
  };
  const completeProfile = () =>
    router.push({ pathname: '/edit-profile', params: { from: 'home' } });
  return (
    <>
      <Screen>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <View style={[layout.row, { gap: 4 }]}>
              <View style={[layout.row, { flex: 1, minWidth: 0, gap: 6 }]}>
                <Image
                  source={require('@/assets/images/zgrana-symbol.svg')}
                  style={{ width: 28, height: 28 }}
                  contentFit="contain"
                  accessible={false}
                />
                <AppText
                  variant="heading"
                  color="brand"
                  style={{ fontSize: 18, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  RazemGo
                </AppText>
              </View>
              {IS_DEMO_MODE ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Warianty ekranu Start"
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
                      backgroundColor: theme.hero,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                    }}
                  >
                    <AppText variant="caption">Demo</AppText>
                  </View>
                </Pressable>
              ) : null}
              <View>
                <IconButton
                  icon="bell"
                  label={
                    'Otwórz Wiadomości' + (total ? ', nowe: ' + total : '')
                  }
                  onPress={() =>
                    openMessages(pending ? 'invitations' : 'conversations')
                  }
                />
                {total ? (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: -2, right: -2 }}
                  >
                    <CountBadge count={total} />
                  </View>
                ) : null}
              </View>
              <IconButton
                icon="settings"
                label="Ustawienia aplikacji"
                onPress={() =>
                  router.push({
                    pathname: '/settings',
                    params: { from: 'home' },
                  })
                }
              />
            </View>
            <View style={{ gap: 2 }}>
              <View style={layout.row}>
                <AppText
                  accessibilityRole="header"
                  variant="heading"
                  style={{ fontSize: 24, lineHeight: 30, flexShrink: 1 }}
                >
                  {hasProfile ? 'Cześć, ekipo!' : 'Cześć, podróżnicy!'}
                </AppText>
                <Icon name="sun" color={theme.energy} size={22} />
              </View>
              {hasProfile ? (
                <AppText
                  variant="label"
                  color="textSecondary"
                  numberOfLines={1}
                >
                  {profile.group.name}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={{ gap: 24, paddingVertical: 8 }}>
            <HomeAction
              label="Znajdź ekipę"
              description="Poznajcie podróżników z podobnymi planami i ruszcie razem w drogę."
              icon="people"
              onPress={discover}
            />
            <HomeAction
              label="Dodaj wyjazd"
              description="Macie cel albo wolny termin? Dodajcie plan i zaproście innych do wspólnej przygody."
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/trip-editor')}
            />
          </View>
          {!hasProfile ? (
            <Card style={{ gap: 8, backgroundColor: theme.muted }}>
              <AppText variant="heading" accessibilityRole="header">
                Witaj w RazemGo!
              </AppText>
              <AppText
                color="textSecondary"
                style={{ fontSize: 14, lineHeight: 21 }}
              >
                Utwórzcie swoją podróżniczą ekipę, żeby łatwiej poznawać ludzi z
                podobnymi planami.
              </AppText>
              <Button
                label="Uzupełnij profil"
                icon="people"
                onPress={completeProfile}
              />
            </Card>
          ) : null}
          {unread ? (
            <ActivityPreview
              title={'Nieprzeczytane wiadomości · ' + unread}
              description="Wróćcie do rozmów i ustalcie szczegóły wspólnych planów."
              icon="chat"
              onPress={() => openMessages('conversations')}
            />
          ) : null}
          {mailbox.loadStatus !== 'ready' ? (
            <ActivityPreview
              title={
                mailbox.loadStatus === 'loading'
                  ? 'Wczytujemy aktywność'
                  : 'Nie udało się wczytać aktywności'
              }
              description="Otwórzcie Wiadomości, aby sprawdzić skrzynkę."
              icon="chat"
              onPress={() => openMessages('conversations')}
            />
          ) : null}
        </View>
      </Screen>
      {demoOpen ? (
        <HomeDemoControls onClose={() => setDemoOpen(false)} />
      ) : null}
    </>
  );
}
