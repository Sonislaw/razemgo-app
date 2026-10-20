import { router } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/primitives';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import {
  notificationCount,
  pendingReceivedCount,
} from '@/features/messaging/messaging-state';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { HomeDemoControls } from '@/features/home/home-demo-controls';
import { HomeAction } from '@/features/home/home-ui';
import { HomeHeader } from '@/features/home/home-header';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const { hasProfile } = useProfile();
  const { state: mailbox, dispatch: dispatchMessages } = useMessaging();
  const { setFilters } = useDiscovery();
  const [demoOpen, setDemoOpen] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(height);
  const [mainHeight, setMainHeight] = useState(0);
  const landscape = width >= 600 && canvasHeight < 500;
  const density =
    mainHeight > 0 &&
    (mainHeight < 330 || (fontScale > 1.2 && mainHeight < 440))
      ? 'minimal'
      : mainHeight > 0 && mainHeight < 400
        ? 'compact'
        : 'regular';
  const minimal = density === 'minimal';
  const showIllustrations = !landscape && !(minimal && fontScale > 1.2);
  const showDescriptions = !(
    fontScale > 1.35 &&
    mainHeight > 0 &&
    mainHeight < 270
  );
  const footerHeight = Math.min(width / 3, 180, Math.max(68, canvasHeight * 0.19));
  const pending =
    mailbox.loadStatus === 'ready' ? pendingReceivedCount(mailbox) : 0;
  const total = notificationCount(mailbox);
  const openMessages = () => {
    dispatchMessages({
      type: 'view',
      view: pending ? 'invitations' : 'conversations',
      direction: 'received',
    });
    router.navigate('/messages');
  };
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
        variant="label"
        style={{
          fontSize: minimal ? 12 : density === 'compact' ? 14 : 16,
          lineHeight: minimal ? 16 : density === 'compact' ? 20 : 24,
        }}
      >
        Łączymy podróżujących kamperem, przyczepą, kampervanem lub z namiotem.
      </AppText>
      {!hasProfile ? (
        <AppText variant="label" color="textSecondary">
          Uzupełnijcie profil ekipy →
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
              paddingTop:
                Spacing.three + (Platform.OS === 'web' ? insets.top : 0),
            },
          ]}
        >
          <HomeHeader
            notifications={total}
            onOpenDemo={() => setDemoOpen(true)}
            onOpenMessages={openMessages}
            onOpenSettings={() =>
              router.push({ pathname: '/settings', params: { from: 'home' } })
            }
          />
          <View
            onLayout={(event) => setMainHeight(event.nativeEvent.layout.height)}
            style={[
              styles.main,
              {
                paddingLeft: Math.max(Spacing.four, insets.left),
                paddingRight: Math.max(Spacing.four, insets.right),
              },
            ]}
          >
            <View
              testID="home-actions"
              style={[
                styles.content,
                {
                  maxWidth: landscape ? 960 : MaxContentWidth,
                  flexDirection: landscape ? 'row' : 'column',
                  alignItems: landscape ? 'center' : 'stretch',
                  gap: minimal ? 8 : density === 'compact' ? 16 : 24,
                },
              ]}
            >
              {hasProfile ? (
                <View style={{ gap: 4, ...(landscape ? { width: 148 } : {}) }}>
                  {introduction}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Uzupełnij profil"
                  onPress={completeProfile}
                  style={{
                    gap: 4,
                    minHeight: 48,
                    justifyContent: 'center',
                    ...(landscape ? { width: 148 } : {}),
                  }}
                >
                  {introduction}
                </Pressable>
              )}
              <View
                style={{
                  gap: minimal ? 8 : 12,
                  ...(landscape ? { flex: 1, flexDirection: 'row' } : {}),
                }}
              >
                <HomeAction
                  label="Znajdź ekipę"
                  description="Poznajcie ekipę na wspólny wyjazd."
                  illustration={require('@/assets/images/home/find-crew.png')}
                  density={density}
                  showIllustration={showIllustrations}
                  showDescription={showDescriptions}
                  onPress={discover}
                  style={landscape ? { flex: 1 } : undefined}
                />
                <HomeAction
                  label="Dodaj wyjazd"
                  description="Podajcie cel lub wybierzcie „Szukam pomysłu”."
                  illustration={require('@/assets/images/home/plan-trip.png')}
                  density={density}
                  showIllustration={showIllustrations}
                  showDescription={showDescriptions}
                  variant="secondary"
                  onPress={() => router.push('/trip-editor')}
                  style={landscape ? { flex: 1 } : undefined}
                />
              </View>
            </View>
          </View>
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
      {demoOpen ? <HomeDemoControls onClose={() => setDemoOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  canvas: { flex: 1, minHeight: 0 },
  main: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%' },
});
