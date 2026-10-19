import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/primitives';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiscoverySort } from './sort-proposals';

const OPTIONS: { value: DiscoverySort; label: string }[] = [
  { value: 'default', label: 'Domyślnie' },
  { value: 'compatibility', label: 'Najwyższa zgodność' },
];

export function DiscoverySortSheet({
  sort,
  onSelect,
  onClose,
}: {
  sort: DiscoverySort;
  onSelect: (value: DiscoverySort) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <BottomSheet title="Sortowanie" onClose={onClose}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Kolejność wyników"
      >
        {OPTIONS.map((option) => {
          const selected = sort === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected ? theme.muted : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText variant="label" style={styles.label}>
                {option.label}
              </AppText>
              {selected ? <Icon name="check" size={20} /> : null}
            </Pressable>
          );
        })}
      </View>
      <AppText variant="caption" color="textSecondary">
        Zgodność od najwyższej do najniższej. Procenty są przykładowe — to dane
        demonstracyjne.
      </AppText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.small,
  },
  label: { flex: 1 },
});
