import { Pressable, StyleSheet, View } from 'react-native';
import { LandscapePhoto } from '@/components/trips/landscape-photo';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { LANDSCAPE_OPTIONS } from '@/constants/landscape-options';
import { useTheme } from '@/hooks/use-theme';
import type { LandscapeKind } from '@/types/travel';

export function TripLandscapePicker({
  value,
  onChange,
}: {
  value: LandscapeKind;
  onChange: (value: LandscapeKind) => void;
}) {
  const theme = useTheme();
  return (
    <View
      testID="trip-landscape-picker"
      accessibilityRole="radiogroup"
      accessibilityLabel="Klimat wyjazdu"
      style={styles.row}
    >
      {LANDSCAPE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.photoFrame,
                { borderColor: selected ? theme.primaryStrong : theme.border },
              ]}
            >
              <LandscapePhoto kind={option.value} style={styles.photo} />
              {selected ? (
                <View
                  style={[styles.check, { backgroundColor: theme.primaryStrong }]}
                >
                  <Icon name="check" size={12} color={theme.onPrimary} />
                </View>
              ) : null}
            </View>
            <AppText
              variant="caption"
              color={selected ? 'primaryStrong' : 'textSecondary'}
              style={{ textAlign: 'center', fontWeight: selected ? '700' : '500' }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  option: { flex: 1, minWidth: 0, minHeight: 48, gap: 6 },
  photoFrame: { borderRadius: 14, borderWidth: 2, padding: 2 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
