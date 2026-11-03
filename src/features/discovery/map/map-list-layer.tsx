import type { ReactNode } from 'react';
import { View } from 'react-native';
export function MapListLayer({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={{ flex: 1, opacity: hidden ? 0 : 1 }}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </View>
  );
}
