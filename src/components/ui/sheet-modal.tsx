import { Modal, StyleSheet, type ModalProps, type ViewProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '@/constants/theme';

export function SheetModal({ children, ...props }: ModalProps) {
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      {...props}
    >
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}

export function SheetSurface({ style, ...props }: ViewProps) {
  return (
    <SafeAreaView
      {...props}
      edges={['bottom', 'left', 'right']}
      style={[styles.surface, style]}
    />
  );
}

const styles = StyleSheet.create({
  surface: { paddingBottom: Spacing.three },
});
