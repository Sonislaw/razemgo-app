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
import { DEMO_GROUPS, DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  discoveryFiltersForTrip,
  isSearchingTrip,
  selectNextTrip,
  todayDate,
} from '@/features/trips/own-trips-state';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  notificationCount,
  pendingReceivedCount,
  unreadCount,
} from '@/features/messaging/messaging-state';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { useDiscovery } from '@/features/discovery/discovery-context';
import {
  INITIAL_FILTERS,
  selectHomeRecommendations,
  type HomeRecommendation,
} from '@/features/discovery/filter-trips';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import {
  ActivityPreview,
  HomeSection,
  NextTripPreview,
  RecommendationPreview,
} from '@/features/home/home-ui';

export default function HomeScreen() {
  const theme = useTheme();
  const { profile, hasProfile } = useProfile();
  const { state: ownTrips } = useOwnTrips();
  const { state: mailbox, dispatch: dispatchMessages } = useMessaging();
  const { setFilters } = useDiscovery();
  const [demoOpen, setDemoOpen] = useState(false);
  const today = todayDate();
  const nearest = selectNextTrip(ownTrips.trips, today);
  const nextSearchable = selectNextTrip(
    ownTrips.trips.filter((trip) => isSearchingTrip(trip, today)),
    today,
  );
  const draft = ownTrips.trips.find((trip) => trip.status === 'draft');
  const recommendations = selectHomeRecommendations(
    DEMO_PROPOSALS,
    profile,
    ownTrips.trips,
    today,
    mailbox.blockedGroupIds,
  );
  const source = recommendations[0]?.source;
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
  const received = mailbox.invitations.filter(
    (item) =>
      item.direction === 'received' &&
      item.status === 'pending' &&
      !mailbox.blockedGroupIds.includes(item.groupId),
  );
  const firstSender = DEMO_GROUPS.find(
    (group) => group.id === received[0]?.groupId,
  )?.name;
  const openMessages = (view: 'conversations' | 'invitations') => {
    dispatchMessages({ type: 'view', view, direction: 'received' });
    router.navigate('/messages');
  };
  const discover = (item?: HomeRecommendation) => {
    const context = item
      ? ownTrips.trips.find((trip) => trip.id === item.ownTripId)
      : nextSearchable;
    setFilters(
      context ? discoveryFiltersForTrip(context) : { ...INITIAL_FILTERS },
    );
    router.navigate('/explore');
  };
  const openRecommendation = (item: HomeRecommendation) => {
    const context = ownTrips.trips.find((trip) => trip.id === item.ownTripId);
    setFilters(
      context ? discoveryFiltersForTrip(context) : { ...INITIAL_FILTERS },
    );
    router.push({
      pathname: '/trip/[id]',
      params: { id: item.proposal.trip.id },
    });
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
          <View style={[layout.row, { alignItems: 'stretch' }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Button
                label="Znajdź ekipę"
                icon="compass"
                onPress={() => discover()}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Button
                label="Dodaj wyjazd"
                icon="plus"
                variant="secondary"
                onPress={() => router.push('/trip-editor')}
              />
            </View>
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
          {nearest ? (
            <HomeSection
              title={
                nearest.startDate <= today
                  ? 'Wasz wyjazd trwa'
                  : 'Najbliższy wyjazd'
              }
              action="Wyjazdy"
              onAction={() => router.navigate('/trips')}
            >
              <NextTripPreview
                trip={nearest}
                onPress={() =>
                  router.push({
                    pathname: '/trips/[id]',
                    params: { id: nearest.id },
                  })
                }
              />
            </HomeSection>
          ) : hasProfile ? (
            <HomeSection
              title={
                draft ? 'Wróćcie do swojego planu' : 'Wasza następna przygoda'
              }
              action="Wyjazdy"
              onAction={() => router.navigate('/trips')}
            >
              <Card style={{ gap: 8 }}>
                <AppText variant="label" style={{ fontSize: 16 }}>
                  {draft
                    ? draft.title
                    : ownTrips.trips.length
                      ? 'Czas na kolejny wspólny wyjazd'
                      : 'Zaplanujcie pierwszą przygodę'}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {draft
                    ? 'Szkic czeka na uzupełnienie i publikację.'
                    : 'Macie cel albo po prostu wolny termin? Zapiszcie plan i poznajcie towarzyszy podróży.'}
                </AppText>
                <Button
                  label={
                    draft
                      ? 'Dokończ szkic'
                      : ownTrips.trips.length
                        ? 'Zaplanuj kolejny wyjazd'
                        : 'Zaplanuj pierwszy wyjazd'
                  }
                  variant="secondary"
                  icon={draft ? 'edit' : 'plus'}
                  onPress={() =>
                    router.push(
                      draft
                        ? { pathname: '/trip-editor', params: { id: draft.id } }
                        : '/trip-editor',
                    )
                  }
                />
              </Card>
            </HomeSection>
          ) : null}
          {pending ? (
            <ActivityPreview
              title={'Nowe zaproszenia · ' + pending}
              description={
                firstSender
                  ? firstSender +
                    (pending > 1
                      ? ' i inne ekipy czekają na odpowiedź.'
                      : ' czeka na odpowiedź.')
                  : 'Poznajcie ekipy, które chcą się z Wami skontaktować.'
              }
              icon="people"
              onPress={() => openMessages('invitations')}
            />
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
          <HomeSection
            title={
              source === 'trip'
                ? 'Poznajcie innych'
                : source === 'interests'
                  ? 'W podobnym klimacie'
                  : 'Może właśnie tutaj?'
            }
            action="Zobacz więcej"
            onAction={() => discover(recommendations[0])}
          >
            <AppText variant="caption" color="textSecondary">
              {source === 'trip'
                ? 'Podobne terminy i kierunki'
                : source === 'interests'
                  ? 'Według Waszych zainteresowań'
                  : 'Inspiracje na kolejne wyjazdy'}
              {IS_DEMO_MODE ? ' · dane demo' : ''}
            </AppText>
            {recommendations.map((item) => (
              <RecommendationPreview
                key={item.proposal.trip.id}
                item={item}
                onPress={() => openRecommendation(item)}
              />
            ))}
            {!recommendations.length ? (
              <Card style={{ gap: 8 }}>
                <AppText variant="label">
                  Na razie bez nowych propozycji
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  Zajrzyjcie do Odkrywaj i wybierzcie inny termin lub kierunek.
                </AppText>
                <Button
                  label="Otwórz Odkrywaj"
                  variant="secondary"
                  icon="compass"
                  onPress={() => discover()}
                />
              </Card>
            ) : null}
          </HomeSection>
        </View>
      </Screen>
      {demoOpen ? (
        <HomeDemoControls onClose={() => setDemoOpen(false)} />
      ) : null}
    </>
  );
}
