import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, IconButton, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function DiscoveryFilterBar({ activeCount, summary, placeholder, filterLabel = 'Otwórz filtry', filterHint,
  clearLabel = 'Wyczyść filtry', refreshLabel, onOpen, onClear, onRefresh }: {
  activeCount: number;
  summary: string;
  placeholder: string;
  filterLabel?: string;
  filterHint: string;
  clearLabel?: string;
  refreshLabel: string;
  onOpen: () => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  return <View style={layout.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={filterLabel} accessibilityHint={filterHint} onPress={onOpen}
      style={({ pressed }) => [styles.filterBar, { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name="filters" size={21} />
      <View style={styles.flex}>
        <AppText variant="label">Filtry{activeCount ? ' · ' + activeCount : ''}</AppText>
        <AppText variant="caption" color="textSecondary">{summary || placeholder}</AppText>
      </View>
      <Icon name="arrow" size={18} />
    </Pressable>
    {activeCount ? <IconButton label={clearLabel} icon="close" onPress={onClear} /> : null}
    <IconButton label={refreshLabel} icon="refresh" onPress={onRefresh} />
  </View>;
}

export function DiscoveryResultsHeader({ title }: {
  title: string;
}) {
  return <View style={styles.resultsHeader}>
    <View style={styles.flex}>
      <AppText variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.resultTitle}>{title}</AppText>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterBar: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 56, padding: 12, gap: Spacing.two,
    borderWidth: 1, borderRadius: Radius.small },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, justifyContent: 'space-between' },
  resultTitle: { fontSize: 18, lineHeight: 24 },
});
