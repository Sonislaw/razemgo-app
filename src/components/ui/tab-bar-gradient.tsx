import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/** A subtle shade over the white tab bar, including its bottom safe area. */
export function TabBarGradient({ height }: { height?: number }) {
  return (
    <Image
      testID="tab-bar-gradient"
      source={require('@/assets/images/tab-bar-gradient.svg')}
      contentFit="fill"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      alt=""
      style={[
        styles.shade,
        height === undefined ? { top: 0 } : { height },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  shade: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1 },
});
