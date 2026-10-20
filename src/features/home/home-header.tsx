import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton, layout } from '@/components/ui/primitives';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { IS_DEMO_MODE } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function HomeHeader({
  notifications,
  onOpenMessages,
  onOpenSettings,
  onOpenDemo,
}: {
  notifications: number;
  onOpenMessages: () => void;
  onOpenSettings: () => void;
  onOpenDemo: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const artworkHeight = Math.min(width / 3, 180);
  const artworkOffset = Math.min(44, artworkHeight * 0.35);
  return (
    <View
      style={[
        styles.header,
        { height: Math.max(88, artworkHeight - artworkOffset) },
      ]}
    >
      <View
        testID="home-header-divider"
        style={styles.background}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image
          source={require('@/assets/images/home-header-meadow.png')}
          style={[
            styles.artwork,
            { height: artworkHeight, top: -artworkOffset },
          ]}
          contentFit="cover"
          contentPosition="bottom"
          accessible={false}
          alt=""
        />
      </View>
      <View
        style={{
          position: 'relative',
          zIndex: 1,
          paddingLeft: Math.max(Spacing.four, insets.left),
          paddingRight: Math.max(Spacing.four, insets.right),
        }}
      >
        <View style={[layout.row, styles.toolbar]}>
          <View style={[layout.row, styles.brand]}>
            <Image
              source={require('@/assets/images/zgrana-symbol.svg')}
              style={{ width: 28, height: 28 }}
              contentFit="contain"
              accessible={false}
            />
            <AppText
              variant="heading"
              color="brand"
              style={{ fontSize: width < 360 ? 16 : 18, flexShrink: 1 }}
              numberOfLines={1}
            >
              RazemGo
            </AppText>
          </View>
          {IS_DEMO_MODE ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Warianty ekranu Start"
              onPress={onOpenDemo}
              style={styles.demoButton}
            >
              <View
                style={[
                  styles.demoBadge,
                  { backgroundColor: theme.hero },
                ]}
              >
                <AppText variant="caption">Demo</AppText>
              </View>
            </Pressable>
          ) : null}
          <View>
            <IconButton
              icon="bell"
              label={
                'Otwórz Wiadomości' +
                (notifications ? ', nowe: ' + notifications : '')
              }
              onPress={onOpenMessages}
            />
            {notifications ? (
              <View pointerEvents="none" style={styles.notificationBadge}>
                <CountBadge count={notifications} />
              </View>
            ) : null}
          </View>
          <IconButton
            icon="settings"
            label="Ustawienia aplikacji"
            onPress={onOpenSettings}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%', marginBottom: Spacing.three },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: -Spacing.three,
    overflow: 'hidden',
  },
  artwork: { position: 'absolute', left: 0, width: '100%' },
  toolbar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: 4,
  },
  brand: { flex: 1, minWidth: 0, gap: 6 },
  demoButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  notificationBadge: { position: 'absolute', top: -2, right: -2 },
});
