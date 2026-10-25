import type { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from './primitives';
import { SheetModal, SheetSurface } from './sheet-modal';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function BottomSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <SheetModal onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zamknij panel"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <SheetSurface
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              marginTop: insets.top,
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              gap: 12,
              borderBottomWidth: 1,
              borderColor: theme.border,
            }}
          >
            <AppText
              variant="heading"
              accessibilityRole="header"
              style={{ flex: 1 }}
            >
              {title}
            </AppText>
            <IconButton label="Zamknij" icon="close" onPress={close} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 + Math.max(insets.bottom, 16), gap: 12 }}
          >
            {children}
          </ScrollView>
        </SheetSurface>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '92%',
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    overflow: 'hidden',
  },
});
