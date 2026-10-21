import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import type { TripMode } from '@/types/travel';

const ICONS = {
  planned: require('@/assets/icons/trip-planning/map-pin.svg'),
  flexible: require('@/assets/icons/trip-planning/trail-signpost.svg'),
  dates: require('@/assets/icons/trip-planning/camp-calendar.svg'),
};

export function TripPlanningIcon({
  kind,
  size = 44,
  framed = true,
}: {
  kind: TripMode | 'dates';
  size?: number;
  framed?: boolean;
}) {
  const theme = useTheme();
  const imageSize = framed ? Math.round(size * 0.75) : size;
  return (
    <View
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: framed ? theme.iconBackground : 'transparent',
        },
      ]}
    >
      <Image
        source={ICONS[kind]}
        contentFit="contain"
        accessible={false}
        alt=""
        style={{ width: imageSize, height: imageSize }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
