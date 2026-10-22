import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, layout } from '@/components/ui/primitives';
import { IS_DEMO_MODE } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getScenicHeaderLayout,
  ScenicHeaderBackground,
} from '@/components/ui/scenic-header';

export function HomeHeader({
  onOpenDemo,
  onCompleteProfile,
}: {
  onOpenDemo: () => void;
  onCompleteProfile?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const logoSize = 48;
  const { height } = getScenicHeaderLayout(width);
  return (
    <View
      style={[
        styles.header,
        { height },
      ]}
    >
      <ScenicHeaderBackground
        testID="home-header-divider"
        style={{ opacity: 1 }}
      />
      <View
        style={{
          position: 'relative',
          zIndex: 1,
          paddingLeft: Math.max(
            compact ? Spacing.three : Spacing.four,
            insets.left,
          ),
          paddingRight: Math.max(
            compact ? Spacing.three : Spacing.four,
            insets.right,
          ),
        }}
      >
        <View style={[layout.row, styles.toolbar]}>
          <View style={styles.brandSlot}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel="Logo ZgranaGo"
              style={[
                styles.brand,
                {
                  backgroundColor: `${theme.backgroundElement}CC`,
                  width: logoSize,
                  height: logoSize,
                  borderRadius: logoSize / 2,
                },
              ]}
            >
              <Image
                source={require('@/assets/images/zgrana-symbol.svg')}
                style={{ width: compact ? 30 : 34, height: compact ? 30 : 34 }}
                contentFit="contain"
                accessible={false}
              />
            </View>
          </View>
          {onCompleteProfile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Uzupełnij profil"
              onPress={onCompleteProfile}
              style={{
                minHeight: 48,
                paddingHorizontal: 12,
                borderRadius: 24,
                justifyContent: 'center',
                backgroundColor: `${theme.backgroundElement}CC`,
              }}
            >
              <AppText variant="label" color="primaryStrong">
                Uzupełnij profil →
              </AppText>
            </Pressable>
          ) : null}
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%', marginBottom: Spacing.three },
  toolbar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: 4,
  },
  brandSlot: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
});
