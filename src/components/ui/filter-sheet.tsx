import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal, SheetSurface } from './sheet-modal';
import { AppText, IconButton } from './primitives';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FilterSheet({ title, description, children, footer, overlay, onClose }: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  overlay?: ReactNode;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <SheetModal onRequestClose={close}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Zamknij panel filtrów" />
      <SheetSurface role="dialog" accessibilityLabel={title} accessibilityViewIsModal aria-modal
        style={[styles.sheet, { backgroundColor: theme.backgroundElement, marginTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.flex}>
            <AppText variant="heading" accessibilityRole="header">{title}</AppText>
            <AppText variant="caption" color="textSecondary">{description}</AppText>
          </View>
          <IconButton label="Zamknij filtry bez zmian" icon="close" onPress={close} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.border }]}>{footer}</View>
        {overlay}
      </SheetSurface>
    </KeyboardAvoidingView>
  </SheetModal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: MaxContentWidth, height: '90%', maxHeight: 800,
    borderTopLeftRadius: Radius.hero, borderTopRightRadius: Radius.hero, overflow: 'hidden' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderBottomWidth: 1 },
  scroll: { flex: 1, minHeight: 0 },
  content: { padding: Spacing.three, gap: Spacing.four },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, borderTopWidth: 1, gap: Spacing.two },
});
