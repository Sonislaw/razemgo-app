import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Spacing } from '@/constants/theme';
import { layout } from './primitives';

export function ChipRow({
  children,
  label,
  horizontal = false,
}: {
  children: ReactNode;
  label: string;
  horizontal?: boolean;
}) {
  if (!horizontal) return <View style={layout.wrap}>{children}</View>;

  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      accessibilityHint="Przesuń w poziomie, aby zobaczyć kolejne opcje."
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0, maxWidth: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
});
