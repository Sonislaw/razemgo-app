import { Modal, View, type ModalProps, type ViewProps } from 'react-native';

export function SheetModal({ children, ...props }: ModalProps) {
  return (
    <Modal transparent visible animationType="slide" {...props}>
      {children}
    </Modal>
  );
}

// SDK 58 web safe-area spacing uses CSS, without a nested measurement provider.
const webSurfaceProps = { dataSet: { sheetSurface: 'true' } };

export function SheetSurface(props: ViewProps) {
  return <View {...props} {...webSurfaceProps} />;
}
