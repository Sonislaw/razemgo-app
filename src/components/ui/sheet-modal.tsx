import { useCallback, useState } from 'react';
import { Animated, Modal, StyleSheet, type ModalProps, type ViewProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '@/constants/theme';
import { SheetTransitionProvider, useSheetSurfaceAnimation } from './sheet-transition';
export { SheetBackdrop } from './sheet-transition';

const AnimatedSurface = Animated.createAnimatedComponent(SafeAreaView);

export function SheetModal({ children, onShow, visible = true, ...props }: ModalProps) {
  const [shown, setShown] = useState(false);
  const handleShow = useCallback<NonNullable<ModalProps['onShow']>>(event => {
    setShown(true);
    onShow?.(event);
  }, [onShow]);
  return (
    <Modal
      transparent
      visible={visible}
      statusBarTranslucent
      navigationBarTranslucent
      {...props}
      animationType="none"
      onShow={handleShow}
    >
      <SafeAreaProvider>
        <SheetTransitionProvider shown={shown && visible}>{children}</SheetTransitionProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

export function SheetSurface({ style, onLayout, ...props }: ViewProps) {
  const animation = useSheetSurfaceAnimation(onLayout);
  return (
    <AnimatedSurface
      {...props}
      edges={['bottom', 'left', 'right']}
      testID={props.testID ?? 'sheet-surface'}
      onLayout={animation.onLayout}
      style={[styles.surface, style, animation.style]}
    />
  );
}

const styles = StyleSheet.create({
  surface: { paddingBottom: Spacing.three },
});
