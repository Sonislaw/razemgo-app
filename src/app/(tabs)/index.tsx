import { DataStatus } from '@/components/ui/data-status';
import { AppText, Button, Screen } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { emptyDiscoveryFilters } from '@/features/discovery/trip-discovery-state';
import { useTripSearch } from '@/features/discovery/use-trip-search';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { HomeHeader } from '@/features/home/home-header';
import { HomeLatestListing } from '@/features/home/home-latest-listing';
import { HomeScenicAction } from '@/features/home/home-scenic-action';
import { selectLatestListing } from '@/features/home/latest-listing';
import { useMessaging } from '@/features/messaging/messaging-context';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { todayDate } from '@/features/trips/own-trips-state';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { TUTORIAL_STEPS, useTutorial } from '@/features/tutorial/tutorial-context';

export default function HomeScreen() {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { step } = useTutorial();
  const showingBell = step !== null && TUTORIAL_STEPS[step]?.target === 'notifications';
  useEffect(() => {
    if (showingBell) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [showingBell]);
  const { hasProfile, profile } = useProfile();
  const { setFilters } = useDiscovery();
  const {
    items: availableProposals,
    status,
    error,
    refresh,
  } = useTripSearch(INITIAL_FILTERS, 1);
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
    setFilters(emptyDiscoveryFilters());
    router.navigate('/explore');
  };

  return (
    <View testID="home-canvas" style={styles.screen}>
      <Screen
        scrollRef={scrollRef}
        testID="home-main"
        fillFooter={!latestListing}
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
          <HomeScenicAction kind="crew" onPress={discover} />
          <HomeScenicAction
            kind="trip"
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
