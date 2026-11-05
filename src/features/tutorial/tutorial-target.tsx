import { useEffect, useRef, type ReactNode, type ComponentRef } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_ITEMS } from '@/constants/navigation';
import { BottomTabInset } from '@/constants/theme';
import { useTutorial, type TutorialTargetId } from './tutorial-context';

export function TutorialTarget({ id, children, style }: {
  id: TutorialTargetId; children?: ReactNode; style?: ViewProps['style'];
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const { anchors } = useTutorial();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const anchor = { node };
    anchors.set(id, anchor);
    return () => { if (anchors.get(id) === anchor) anchors.delete(id); };
  }, [anchors, id]);
  return <View ref={ref} collapsable={false} style={style} testID={`tutorial-target-${id}`}>{children}</View>;
}

// Native tabs are system controls, without per-item React refs. Measure transparent
// regions over the same fixed bar area used by AppTabs' bottom gradient.
export function NativeTutorialTabTargets() {
  const insets = useSafeAreaInsets();
  const { step } = useTutorial();
  if (step === null) return null;
  return <View
    pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', left: insets.left, right: insets.right, bottom: insets.bottom, height: BottomTabInset, flexDirection: 'row' }}
  >
    {TAB_ITEMS.map(tab => <TutorialTarget key={tab.name} id={tab.name} style={styles.nativeItem} />)}
  </View>;
}
const styles = StyleSheet.create({ nativeItem: { flex: 1 } });
