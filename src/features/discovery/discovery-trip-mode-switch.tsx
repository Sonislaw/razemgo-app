import { AppText } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { TripMode } from '@/types/travel';
import { Pressable, StyleSheet, View } from 'react-native';

export function DiscoveryTripModeSwitch({ value, onChange }: {
  value: TripMode;
  onChange: (mode: TripMode) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Typ ogłoszenia">
      {([
        { mode: 'flexible', label: 'Szukam pomysłu' },
        { mode: 'planned', label: 'Mam plan' },
      ] as const).map(({ mode, label }) => {
        const selected = value === mode;
        return (
          <Pressable key={mode} accessibilityRole="radio" accessibilityLabel={label}
            accessibilityState={{ checked: selected }} aria-checked={selected}
            onPress={() => { if (!selected) onChange(mode); }}
            style={({ pressed }) => [styles.option, {
              flex: mode === 'flexible' ? 1.35 : 1,
              borderColor: selected ? theme.primaryStrong : theme.border,
              backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
              opacity: pressed ? 0.75 : 1,
            }]}>
            <AppText variant="label" color={selected ? 'primaryStrong' : 'textSecondary'}
              numberOfLines={1} style={styles.label}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    minWidth: 0, minHeight: 44, paddingHorizontal: 8, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
});
