import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from './bottom-sheet';
import { Icon } from './icon';
import { AppText } from './primitives';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SortOptionsSheet<T extends string>({ title = 'Sortowanie', value, options, caption, onSelect, onClose }: {
  title?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  caption: string;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return <BottomSheet title={title} onClose={onClose}>
    <View accessibilityRole="radiogroup" accessibilityLabel="Kolejność wyników">
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
          accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => onSelect(option.value)}
          style={({ pressed }) => [styles.option, { backgroundColor: selected ? theme.muted : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
          <AppText variant="label" style={styles.label}>{option.label}</AppText>
          {selected ? <Icon name="check" size={20} /> : null}
        </Pressable>;
      })}
    </View>
    <AppText variant="caption" color="textSecondary">{caption}</AppText>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: Radius.small },
  label: { flex: 1 },
});
