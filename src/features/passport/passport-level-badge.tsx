import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { TravelGroup } from '@/types/travel';
import { useOwnPassport } from './passport-context';
import { PASSPORT_ENABLED } from './passport-config';
import { EMPTY_PASSPORT_SUMMARY } from './passport-data';

export function PassportLevelBadge({ group, compact = false, centered = false, levelOnly = false, showIcon = true }: {
  group: TravelGroup; compact?: boolean; centered?: boolean; levelOnly?: boolean; showIcon?: boolean;
}) {
  const theme = useTheme();
  const own = useOwnPassport();
  if (!PASSPORT_ENABLED) return null;
  const isOwn = own.groupId === group.id;
  const summary = isOwn ? own.data?.summary ?? group.passport : group.passport ?? EMPTY_PASSPORT_SUMMARY;
  if (!summary) return null;
  const label = levelOnly ? `Poziom ${summary.level}` : compact ? summary.title : `Poziom ${summary.level} · ${summary.title}`;
  return <View testID={'passport-level-' + group.id} accessible accessibilityRole="text"
    accessibilityLabel={levelOnly ? label : `Poziom ekipy ${summary.level}. ${summary.title}`}
    style={[styles.badge, { backgroundColor: theme.hero, borderColor: theme.border, alignSelf: centered ? 'center' : 'flex-start' }, compact && styles.compact]}>
    {showIcon ? <Icon name="passport" size={compact ? 12 : 16} color={theme.heroText} /> : null}
    <AppText variant="caption" style={{ color: theme.heroText, fontWeight: '700', flexShrink: 1 }}>
      {label}
    </AppText>
  </View>;
}
const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9,
    paddingVertical: 4, borderWidth: 1, borderRadius: 20, maxWidth: '100%' },
  compact: { paddingHorizontal: 6, paddingVertical: 1, gap: 3 },
});
