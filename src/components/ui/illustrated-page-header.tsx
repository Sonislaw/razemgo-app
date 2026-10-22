import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppText } from './primitives';

interface IllustratedPageHeaderProps {
  title: string;
  description: string;
  titleLeading?: ReactNode;
  actions?: ReactNode;
}

export function IllustratedPageHeader({
  title,
  description,
  titleLeading,
  actions,
}: IllustratedPageHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Native tabs adjust the ScrollView's top inset automatically on iOS.
  const topInset = Platform.OS === 'ios' ? 0 : insets.top;
  const compact = width < 360;
  const artworkHeight = Math.min(280, Math.max(208, width / 2));
  const headerHeight = artworkHeight + topInset;

  return (
    <View
      testID="illustrated-page-header"
      style={[
        styles.header,
        { minHeight: headerHeight, backgroundColor: theme.background },
      ]}
    >
      <View
        testID="illustrated-header-artwork"
        style={[styles.artwork, { height: headerHeight }]}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image
          source={require('@/assets/images/section-header-coast.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="bottom right"
          accessible={false}
          alt=""
        />
        <Image
          source={require('@/assets/images/section-header-wash.svg')}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          accessible={false}
          alt=""
        />
        <Image
          source={require('@/assets/images/section-header-wave.svg')}
          tintColor={theme.background}
          style={styles.wave}
          contentFit="fill"
          accessible={false}
          alt=""
        />
      </View>
      <View
        style={[
          styles.content,
          {
            paddingTop: topInset + Spacing.three,
            paddingLeft: Math.max(Spacing.four, insets.left),
            paddingRight: Math.max(Spacing.four, insets.right),
          },
        ]}
      >
        <View style={styles.toolbar}>
          {!titleLeading ? (
            <Image
              source={require('@/assets/images/section-header-sun.svg')}
              style={styles.sun}
              contentFit="contain"
              accessible={false}
              alt=""
            />
          ) : null}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
        <View style={styles.titleRow}>
          {titleLeading}
          <AppText
            accessibilityRole="header"
            variant="title"
            style={[
              styles.title,
              { fontSize: compact ? 32 : 36, lineHeight: compact ? 40 : 44 },
            ]}
          >
            {title}
          </AppText>
        </View>
        <AppText color="textSecondary" style={styles.description}>
          {description}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  // Keep the crop and wave independent of the amount of header copy.
  artwork: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#E5F4FB',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: 32,
  },
  toolbar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sun: { width: 48, height: 36 },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // The artwork stays light, so the overlaid copy uses dark ink in either theme.
  title: {
    flex: 1,
    minWidth: 0,
    color: Colors.light.text,
    fontWeight: '800',
  },
  description: {
    marginTop: Spacing.one,
    maxWidth: '72%',
    color: '#48606E',
    fontSize: 15,
    lineHeight: 21,
  },
  wave: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 32,
  },
});
