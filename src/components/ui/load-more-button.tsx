import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from './icon';
import { AppText } from './primitives';

interface LoadMoreButtonProps {
  label: string;
  loadingLabel?: string;
  loadingAccessibilityLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function LoadMoreButton({
  label,
  loadingLabel = 'Wczytywanie…',
  loadingAccessibilityLabel = loadingLabel,
  loading = false,
  disabled = false,
  onPress,
}: LoadMoreButtonProps) {
  const theme = useTheme();
  const unavailable = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingLabel : label}
      accessibilityHint="Wczytaj kolejną część listy."
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.primaryStrong,
          opacity: unavailable ? 0.7 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <AppText variant="label" style={[styles.label, { color: theme.onPrimary }]}>
        {loading ? loadingLabel : label}
      </AppText>
      <View style={styles.indicator}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.onPrimary} accessibilityLabel={loadingAccessibilityLabel} />
        ) : (
          <Icon name="plus" size={22} color={theme.onPrimary} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%', minHeight: 56, paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    boxShadow: '0 3px 12px rgba(8, 105, 150, 0.18)',
  },
  label: { flexShrink: 1, textAlign: 'center', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  indicator: {
    width: 30, height: 30, flexShrink: 0, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
});
