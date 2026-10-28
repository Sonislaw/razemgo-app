import { DataStatus } from '@/components/ui/data-status';
import { AppText, Button, Screen } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { useTripSearch } from '@/features/discovery/use-trip-search';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { HomeHeader } from '@/features/home/home-header';
import { HomeLatestListing } from '@/features/home/home-latest-listing';
import { HomeAction } from '@/features/home/home-ui';
import { selectLatestListing } from '@/features/home/latest-listing';
import { useMessaging } from '@/features/messaging/messaging-context';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { todayDate } from '@/features/trips/own-trips-state';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { hasProfile, profile } = useProfile();
  const { setFilters } = useDiscovery();
  const {
    items: availableProposals,
    status,
    error,
    refresh,
  } = useTripSearch(INITIAL_FILTERS, 'default', 1);
  const { state: ownTrips } = useOwnTrips();
  const { state: messaging } = useMessaging();
  const [demoOpen, setDemoOpen] = useState(false);
  const latestListing = selectLatestListing(
    availableProposals,
    ownTrips.trips,
    profile.group.id,
    todayDate(),
    messaging.blockedGroupIds,
  );
  const latestOwnTrip = latestListing?.own
    ? ownTrips.trips.find((trip) => trip.id === latestListing.trip.id)
    : undefined;
  const latestGroup = latestListing?.own
    ? profile.group
    : availableProposals.find((item) => item.trip.id === latestListing?.trip.id)
        ?.group;
  const discover = () => {
    setFilters({ ...INITIAL_FILTERS });
    router.navigate('/explore');
  };

  return (
    <View testID="home-canvas" style={styles.screen}>
      <Screen
        testID="home-main"
        header={<HomeHeader onOpenDemo={() => setDemoOpen(true)} />}
      >
        {!hasProfile ? (
          <Button
            label="Uzupełnij profil"
            icon="edit"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/edit-profile',
                params: { from: 'home' },
              })
            }
          />
        ) : null}
        <View testID="home-actions" style={styles.actions}>
          <HomeAction
            label="Znajdź ekipę"
            description="Poznaj podróżników z podobnymi planami."
            illustration={require('@/assets/images/home/find-crew.webp')}
            density={width < 360 ? 'compact' : 'regular'}
            onPress={discover}
          />
          <HomeAction
            label="Dodaj wyjazd"
            description="Zaplanuj wyjazd i znajdź towarzystwo."
            illustration={require('@/assets/images/home/plan-trip.webp')}
            density={width < 360 ? 'compact' : 'regular'}
            variant="secondary"
            onPress={() => router.push('/trip-editor')}
          />
        </View>
        <DataStatus
          status={status}
          error={error}
          onRetry={() => {
            void refresh();
          }}
          label="Wczytywanie ogłoszeń"
        />
        {latestListing ? (
          <View testID="home-latest-section" style={styles.latest}>
            <AppText variant="label" accessibilityRole="header">
              Najnowsze ogłoszenie
            </AppText>
            <HomeLatestListing
              trip={latestListing.trip}
              group={latestGroup}
              travelModes={
                latestOwnTrip?.travelModes ?? latestListing.trip.travelModes
              }
              score={
                latestListing.own
                  ? undefined
                  : availableProposals.find(
                      (p) => p.trip.id === latestListing.trip.id,
                    )?.compatibility.score
              }
              isOwn={latestListing.own}
              onPress={() =>
                router.push({
                  pathname: latestListing.own ? '/trips/[id]' : '/trip/[id]',
                  params: { id: latestListing.trip.id },
                })
              }
            />
          </View>
        ) : null}
      </Screen>
      {demoOpen ? (
        <HomeDemoControls onClose={() => setDemoOpen(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  actions: { gap: 20, paddingVertical: Spacing.two },
  latest: { gap: Spacing.two },
});
