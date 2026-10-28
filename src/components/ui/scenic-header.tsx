import { Spacing } from '@/constants/theme';
import { Image } from 'expo-image';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export function getScenicHeaderLayout(width: number) {
  const artworkHeight = Math.min(width / 3, 180);
  const artworkOffset = Math.min(44, artworkHeight * 0.35);
  return {
    artworkHeight,
    artworkOffset,
    height: Math.max(88, artworkHeight - artworkOffset),
  };
}

export function ScenicHeaderBackground({
  testID = 'scenic-page-header',
  style,
}: {
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const { artworkHeight, artworkOffset, height } = getScenicHeaderLayout(width);
  return (
    <View
      testID={testID}
      style={[styles.background, { height: height + Spacing.three }, style]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('@/assets/images/home-header-meadow.webp')}
        style={[styles.artwork, { height: artworkHeight, top: -artworkOffset }]}
        contentFit="cover"
        contentPosition="bottom"
        accessible={false}
        alt=""
      />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -Spacing.three,
    overflow: 'hidden',
    opacity: 0.65,
  },
  artwork: { position: 'absolute', left: 0, width: '100%' },
});
