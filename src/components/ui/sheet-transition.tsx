import { useTheme } from '@/hooks/use-theme';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';

const SheetTransitionContext = createContext<{
  backdrop: Animated.Value;
  surface: Animated.Value;
} | null>(null);

export function SheetTransitionProvider({ shown, children }: { shown: boolean; children: ReactNode }) {
  const [backdrop] = useState(() => new Animated.Value(0));
  const [surface] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (active) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      value => { if (active) setReduceMotion(value); },
      () => { if (active) setReduceMotion(false); },
    );
    return () => { active = false; subscription?.remove(); };
  }, []);

  useEffect(() => {
    if (!shown) {
      backdrop.setValue(0);
      surface.setValue(0);
      return;
    }
    if (reduceMotion === null) return;
    if (reduceMotion) {
      backdrop.setValue(1);
      surface.setValue(1);
      return;
    }
    // The backdrop never moves. Start the card only after dimming has finished.
    const animation = Animated.sequence([
      Animated.timing(backdrop, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(surface, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [shown, reduceMotion, backdrop, surface]);

  const value = useMemo(() => ({ backdrop, surface }), [backdrop, surface]);
  return <SheetTransitionContext value={value}>{children}</SheetTransitionContext>;
}

function useTransition() {
  const value = useContext(SheetTransitionContext);
  if (!value) throw new Error('Sheet transition requires SheetModal');
  return value;
}

export function SheetBackdrop({ onPress, label, cutout }: { onPress: () => void; label: string; cutout?: { x: number; y: number; width: number; height: number } }) {
  const theme = useTheme();
  const { backdrop } = useTransition();
  return <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill, { backgroundColor: cutout ? 'transparent' : theme.scrim, opacity: backdrop }]}>
    {cutout ? <>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cutout.y, backgroundColor: theme.scrim }} />
      <View style={{ position: 'absolute', top: cutout.y + cutout.height, left: 0, right: 0, bottom: 0, backgroundColor: theme.scrim }} />
      <View style={{ position: 'absolute', top: cutout.y, left: 0, width: cutout.x, height: cutout.height, backgroundColor: theme.scrim }} />
      <View style={{ position: 'absolute', top: cutout.y, left: cutout.x + cutout.width, right: 0, height: cutout.height, backgroundColor: theme.scrim }} />
    </> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

export function useSheetSurfaceAnimation(onLayout: ViewProps['onLayout']) {
  const { surface } = useTransition();
  const { height } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const translateY = useMemo(() => surface.interpolate({ inputRange: [0, 1], outputRange: [measuredHeight || height, 0] }), [surface, measuredHeight, height]);
  return {
    style: { transform: [{ translateY }] },
    onLayout: ((event) => {
      setMeasuredHeight(event.nativeEvent.layout.height);
      onLayout?.(event);
    }) satisfies NonNullable<ViewProps['onLayout']>,
  };
}
