import { Image } from 'expo-image';
import { View } from 'react-native';

/** Decorative travel motif above the introduction, scaled to available space. */
export function HomeTravelIllustration({ height }: { height: number }) {
  return (
    <View
      testID="home-travel-illustration"
      style={{ height }}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('@/assets/images/home/travel-ribbon.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        accessible={false}
        alt=""
      />
    </View>
  );
}
