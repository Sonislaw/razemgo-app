import { router } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/primitives';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import { getScenicHeaderLayout } from '@/components/ui/scenic-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { HomeAction } from '@/features/home/home-ui';
import { HomeHeader } from '@/features/home/home-header';
import { HomeLatestListing } from '@/features/home/home-latest-listing';
import { selectLatestListing } from '@/features/home/latest-listing';
import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { todayDate } from '@/features/trips/own-trips-state';
import { useMessaging } from '@/features/messaging/messaging-context';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const { hasProfile, profile } = useProfile();
  const { setFilters } = useDiscovery();
  const { state: ownTrips } = useOwnTrips();
  const { state: messaging } = useMessaging();
  const latestListing = selectLatestListing(
    DEMO_PROPOSALS,
    ownTrips.trips,
    profile.group.id,
    todayDate(),
    messaging.blockedGroupIds,
  );
  const [demoOpen, setDemoOpen] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(height);
  const [contentHeight, setContentHeight] = useState(0);
  const { height: scenicHeaderHeight } = getScenicHeaderLayout(width);
  const webTopInset = Platform.OS === 'web' ? insets.top : 0;
  const preferredFooterHeight = Math.min(
    width / 3,
    180,
    Math.max(68, canvasHeight * 0.19),
  );
  // Keep CTA sizing independent of any space recovered from the decorations.
  const mainHeight = Math.max(
    0,
    canvasHeight -
      Spacing.three -
      webTopInset -
      scenicHeaderHeight -
      Spacing.three -
      preferredFooterHeight,
  );
  const landscape = width >= 600 && canvasHeight < 500;
  const density =
    mainHeight < 420 || (fontScale > 1.2 && mainHeight < 640)
      ? 'minimal'
      : mainHeight > 0 && mainHeight < 580
        ? 'compact'
        : 'regular';
  const minimal = density === 'minimal';
  // Keep the CTA sizes from before the latest-listing section was added.
  const actionDensity =
    mainHeight > 0 &&
    (mainHeight < 370 || (fontScale > 1.2 && mainHeight < 440))
      ? 'minimal'
      : mainHeight > 0 && mainHeight < 460
        ? 'compact'
        : 'regular';
  const shortScreen = mainHeight > 0 && mainHeight < 270;
  const contentGap = minimal ? 4 : density === 'compact' ? 12 : 16;
  const showIllustrations =
    !landscape && !(actionDensity === 'minimal' && fontScale > 1.2);
  const showDescriptions = !shortScreen;
  const compactListing = mainHeight < 600;
  const compactChrome = mainHeight < 320 || fontScale > 1.2 || landscape;
  const topPadding = (compactChrome ? 8 : Spacing.three) + webTopInset;
  const mainPadding = compactChrome ? 4 : 8;
  const headerHeight = compactChrome ? 64 : scenicHeaderHeight;
  const headerGap = compactChrome ? 8 : Spacing.three;
  const footerHeight = Math.min(
    preferredFooterHeight,
    Math.max(
      64,
      canvasHeight -
        topPadding -
        headerHeight -
        headerGap -
        contentHeight -
        mainPadding * 2,
    ),
  );
  const discover = () => {
    setFilters({ ...INITIAL_FILTERS });
    router.navigate('/explore');
  };
  const completeProfile = () =>
    router.push({ pathname: '/edit-profile', params: { from: 'home' } });
  const introduction = (
    <>
      <AppText
        accessibilityRole="header"
        variant="heading"
        style={{
          fontSize: minimal ? 20 : density === 'compact' ? 24 : 28,
          lineHeight: minimal ? 26 : density === 'compact' ? 30 : 36,
        }}
      >
        Podróżuj razem.
      </AppText>
      <AppText
        color="textSecondary"
        style={{
          fontSize: minimal ? 13 : density === 'compact' ? 14 : 16,
          lineHeight: minimal ? 18 : density === 'compact' ? 20 : 24,
        }}
      >
        Znajdź towarzystwo na kolejną przygodę.
      </AppText>
      {!hasProfile && !compactChrome ? (
        <AppText variant="label" color="textSecondary">
          Uzupełnij profil ekipy →
        </AppText>
      ) : null}
    </>
  );
  return (
    <>
      <SafeAreaView
        edges={{ top: true, bottom: true }}
        style={[styles.screen, { backgroundColor: theme.background }]}
      >
        <View
          testID="home-canvas"
          onLayout={(event) => setCanvasHeight(event.nativeEvent.layout.height)}
          style={[
            styles.canvas,
            {
              paddingTop: topPadding,
            },
          ]}
        >
          <HomeHeader
            onOpenDemo={() => setDemoOpen(true)}
            dense={compactChrome}
            onCompleteProfile={
              compactChrome && !hasProfile ? completeProfile : undefined
            }
          />
          <ScrollView
            testID="home-main"
            style={styles.main}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.mainContent,
              {
                paddingLeft: Math.max(Spacing.four, insets.left),
                paddingRight: Math.max(Spacing.four, insets.right),
                paddingVertical: mainPadding,
              },
            ]}
          >
            <View
              testID="home-actions"
              onLayout={(event) =>
                setContentHeight(event.nativeEvent.layout.height)
              }
              style={[
                styles.content,
                {
                  maxWidth: landscape ? 960 : MaxContentWidth,
                  flexDirection: landscape ? 'row' : 'column',
                  alignItems: landscape ? 'center' : 'stretch',
                  gap: contentGap,
                },
              ]}
            >
              <View
                style={[
                  styles.introduction,
                  landscape ? { width: 148 } : undefined,
                ]}
              >
                {hasProfile || compactChrome ? (
                  introduction
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Uzupełnij profil"
                    onPress={completeProfile}
                    style={{ gap: 8, minHeight: 48, justifyContent: 'center' }}
                  >
                    {introduction}
                  </Pressable>
                )}
              </View>
              <View
                style={{
                  gap: minimal ? 8 : 12,
                  marginVertical: !landscape ? 8 : 0,
                  ...(landscape ? { flexDirection: 'row' } : {}),
                  ...(landscape ? { flex: 2 } : {}),
                }}
              >
                <HomeAction
                  label="Znajdź ekipę"
                  description="Poznaj podróżników z podobnymi planami."
                  illustration={require('@/assets/images/home/find-crew.png')}
                  density={actionDensity}
                  showIllustration={showIllustrations}
                  showDescription={showDescriptions}
                  onPress={discover}
                  style={landscape ? { flex: 1 } : undefined}
                />
                <HomeAction
                  label="Dodaj wyjazd"
                  description="Zaplanuj wyjazd i znajdź towarzystwo."
                  illustration={require('@/assets/images/home/plan-trip.png')}
                  density={actionDensity}
                  showIllustration={showIllustrations}
                  showDescription={showDescriptions}
                  variant="secondary"
                  onPress={() => router.push('/trip-editor')}
                  style={landscape ? { flex: 1 } : undefined}
                />
              </View>
              {latestListing ? (
                <View
                  testID="home-latest-section"
                  style={{
                    gap: minimal ? 4 : 6,
                    ...(landscape ? { flex: 1 } : {}),
                  }}
                >
                  {mainHeight === 0 || mainHeight >= 120 ? (
                    <AppText variant="label" accessibilityRole="header">
                      Najnowsze ogłoszenie
                    </AppText>
                  ) : null}
                  <HomeLatestListing
                    trip={latestListing.trip}
                    compact={compactListing}
                    onPress={() =>
                      router.push({
                        pathname: latestListing.own
                          ? '/trips/[id]'
                          : '/trip/[id]',
                        params: { id: latestListing.trip.id },
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          </ScrollView>
          <View
            style={{
              height: footerHeight,
              overflow: 'hidden',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
            <ScenicFooter />
          </View>
        </View>
      </SafeAreaView>
      {demoOpen ? (
        <HomeDemoControls onClose={() => setDemoOpen(false)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  canvas: { flex: 1, minHeight: 0 },
  main: { flex: 1, minHeight: 0 },
  mainContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { width: '100%' },
  introduction: { gap: 4 },
});
