import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function ScenicFooter({
  leftInset = 0,
  rightInset = 0,
}: {
  leftInset?: number;
  rightInset?: number;
}) {
  return (
    <View
      testID="scenic-page-footer"
      style={[
        styles.footer,
        { marginLeft: -leftInset, marginRight: -rightInset },
      ]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('@/assets/images/scenic-footer.webp')}
        style={styles.image}
        contentFit="contain"
        accessible={false}
        alt=""
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { alignSelf: 'stretch', marginTop: 'auto', flexShrink: 0 },
  image: { width: '100%', aspectRatio: 3 },
});
