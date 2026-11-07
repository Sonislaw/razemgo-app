import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { TravelGroup } from '@/types/travel';
import { usePassportLevelSummary } from './passport-level-summary';
import { PassportLevelEmblemArtwork } from './passport-level-emblem';

export function PassportLevelBadge({ group, compact = false, centered = false, levelOnly = false, showIcon = true, emblem = false }: {
  group: TravelGroup; compact?: boolean; centered?: boolean; levelOnly?: boolean; showIcon?: boolean; emblem?: boolean;
}) {
  const theme = useTheme();
  const summary = usePassportLevelSummary(group);
  if (!summary) return null;
  const label = emblem ? summary.title : levelOnly ? `Poziom ${summary.level}` : compact ? summary.title : `Poziom ${summary.level} · ${summary.title}`;
  return <View testID={'passport-level-' + group.id} accessible accessibilityRole="text"
    accessibilityLabel={levelOnly ? label : `Poziom ekipy ${summary.level}. ${summary.title}`}
    style={[styles.badge, { backgroundColor: theme.hero, borderColor: theme.border, alignSelf: centered ? 'center' : 'flex-start' }, compact && styles.compact, emblem && styles.emblemBadge]}>
    {emblem ? <PassportLevelEmblemArtwork level={summary.level} size={32}
      testID={'passport-level-emblem-' + group.id} style={styles.emblemArtwork} />
      : showIcon ? <Icon name="passport" size={compact ? 12 : 16} color={theme.heroText} /> : null}
    <AppText variant="caption" numberOfLines={emblem ? 1 : undefined}
      style={[{ color: theme.heroText, fontWeight: '700', flexShrink: 1 }, emblem && styles.emblemText]}>
      {label}
    </AppText>
  </View>;
}
const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9,
    paddingVertical: 4, borderWidth: 1, borderRadius: 20, maxWidth: '100%' },
  compact: { paddingHorizontal: 6, paddingVertical: 1, gap: 3 },
  emblemBadge: { minHeight: 26, paddingVertical: 0, paddingLeft: 3, paddingRight: 7, gap: 4 },
  emblemArtwork: { marginVertical: -8 },
  emblemText: { fontSize: 11, lineHeight: 16 },
});
