import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { Colors } from '@/constants/theme';
import type { PassportCategory, PassportSummary } from '@/types/passport';
import { levelProgress } from './passport-data';

const materials = [
  { ink: '#8D4D20', paper: '#FAEEE1' }, { ink: '#526779', paper: '#EFF3F6' },
  { ink: '#805B08', paper: '#FFF3CA' }, { ink: '#176A77', paper: '#E6F5F6' },
];
export function PassportStamp({ category, tier, small = false }: { category: PassportCategory; tier: number; small?: boolean }) {
  const theme = useTheme();
  const material = materials[Math.max(0, tier - 1)];
  const ink = tier ? material.ink : theme.textSecondary;
  return <View accessible={false} style={[styles.stamp, small && styles.smallStamp,
    { borderColor: ink, backgroundColor: tier ? material.paper : theme.muted }]}>
    <Icon name={category.icon as IconName} size={small ? 23 : 31} color={ink} />
    <View style={styles.dots}>
      {category.thresholds.map((_, i) => <View key={i} style={[styles.dot, { borderColor: ink,
        backgroundColor: i < tier ? ink : 'transparent' }]} />)}
    </View>
  </View>;
}
export function PassportProgressBar({ fraction, label, onArtwork = false, onDarkArtwork = false }: {
  fraction: number; label: string; onArtwork?: boolean; onDarkArtwork?: boolean;
}) {
  const theme = useTheme();
  const colors = onArtwork ? Colors.light : theme;
  return <View accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, Math.max(0, fraction)) * 100) }}
    style={[styles.track, { backgroundColor: onDarkArtwork ? '#587375' : colors.muted }]}>
    <View style={[styles.fill, { backgroundColor: onDarkArtwork ? '#F9CD6A' : colors.primaryStrong, width: `${Math.min(1, Math.max(0, fraction)) * 100}%` }]} />
  </View>;
}
export function PassportLevelProgress({ summary, onArtwork = false }: { summary: PassportSummary; onArtwork?: boolean }) {
  const progress = levelProgress(summary);
  return <View style={{ gap: 8 }}>
    <PassportProgressBar fraction={progress.fraction} label="Postęp poziomu ekipy" onArtwork={onArtwork} />
    <AppText variant="caption" color="textSecondary" style={onArtwork ? { color: Colors.light.textSecondary } : undefined}>
      {progress.next ? `${summary.points} pkt · do poziomu ${progress.next.level} brakuje ${progress.remaining} pkt` :
        `${summary.points} pkt · najwyższy poziom ekipy`}
    </AppText>
  </View>;
}
const styles = StyleSheet.create({
  stamp: { width: 76, height: 76, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, transform: [{ rotate: '-5deg' }] },
  smallStamp: { width: 54, height: 54, borderRadius: 18, gap: 6 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, borderWidth: 1 },
  track: { height: 7, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 7 },
});
