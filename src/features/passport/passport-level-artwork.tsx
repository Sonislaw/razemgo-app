import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';

const scenes: Record<number, ImageSource> = {
  1: require('@/assets/images/passport/levels/beginning.jpg'),
  2: require('@/assets/images/passport/levels/on-the-road.jpg'),
  3: require('@/assets/images/passport/levels/explorers.jpg'),
  4: require('@/assets/images/passport/levels/travelers.jpg'),
  5: require('@/assets/images/passport/levels/experienced-crew.jpg'),
  6: require('@/assets/images/passport/levels/guides.jpg'),
  7: require('@/assets/images/passport/levels/trail-legend.jpg'),
  8: require('@/assets/images/passport/levels/around-the-world.jpg'),
};

export function PassportLevelArtwork({ level }: { level: number }) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Image testID={'passport-level-artwork-' + level} source={scenes[level] ?? scenes[1]}
      contentFit="cover" contentPosition="center" cachePolicy="memory-disk" transition={0}
      style={StyleSheet.absoluteFill} accessible={false} alt="" />
    <Image source={require('@/assets/images/passport/levels/header-wash.svg')} contentFit="fill"
      style={StyleSheet.absoluteFill} accessible={false} alt="" />
  </View>;
}
