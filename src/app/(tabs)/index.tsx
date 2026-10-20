import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  notificationCount,
  pendingReceivedCount,
  unreadCount,
} from '@/features/messaging/messaging-state';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { ActivityPreview, HomeAction } from '@/features/home/home-ui';
import { HomeHeader } from '@/features/home/home-header';

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
      <Screen
        header={
          <HomeHeader
            notifications={total}
            onOpenDemo={() => setDemoOpen(true)}
            onOpenMessages={() =>
              openMessages(pending ? 'invitations' : 'conversations')
            }
            onOpenSettings={() =>
              router.push({
                pathname: '/settings',
                params: { from: 'home' },
              })
            }
          />
        }
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
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
