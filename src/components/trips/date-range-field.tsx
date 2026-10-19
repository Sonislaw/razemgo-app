import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatTripDates,
  getDiscoveryDateRangeError,
} from '@/features/discovery/filter-trips';
import type { DateRange } from '@/types/travel';

export function DateRangeField({
  range,
  caption,
  onPress,
}: {
  range?: DateRange;
  caption?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const title =
    range && !getDiscoveryDateRangeError(range)
      ? formatTripDates(range)
      : 'Wybierz daty';
  const detail = caption ?? 'Dzień wyjazdu i powrotu';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Wybierz zakres dat"
      accessibilityHint={title + ', ' + detail}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name="calendar" size={22} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary">
          {detail}
        </AppText>
      </View>
      <Icon name="chevron" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: Radius.small,
    padding: 12,
  },
});
