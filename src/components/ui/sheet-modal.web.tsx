import { useCallback, useState } from 'react';
import { Animated, Modal, type ModalProps, type ViewProps } from 'react-native';
import { SheetTransitionProvider, useSheetSurfaceAnimation } from './sheet-transition';
export { SheetBackdrop } from './sheet-transition';

export function SheetModal({ children, onShow, visible = true, ...props }: ModalProps) {
  const [shown, setShown] = useState(false);
  const handleShow = useCallback<NonNullable<ModalProps['onShow']>>(event => {
    setShown(true);
    onShow?.(event);
  }, [onShow]);
  return (
    <Modal transparent visible={visible} {...props} animationType="none" onShow={handleShow}>
      <SheetTransitionProvider shown={shown && visible}>{children}</SheetTransitionProvider>
    </Modal>
  );
}

// SDK 58 web safe-area spacing uses CSS, without a nested measurement provider.
const webSurfaceProps = { dataSet: { sheetSurface: 'true' } };

export function SheetSurface({ style, onLayout, ...props }: ViewProps) {
  const animation = useSheetSurfaceAnimation(onLayout);
  return <Animated.View {...props} {...webSurfaceProps} testID={props.testID ?? 'sheet-surface'} onLayout={animation.onLayout} style={[style, animation.style]} />;
}
