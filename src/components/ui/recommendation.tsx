import { StyleSheet, View } from 'react-native';
import { AppText } from './primitives';
import { Icon, type IconName } from './icon';
import { useTheme } from '@/hooks/use-theme';
import { cardReasons, RECOMMENDATION_LABELS, reasonText, type Recommendation } from '@/features/recommendations/recommendation';

const ICONS: Record<NonNullable<Recommendation['label']>, IconName> = {
  similar_plans: 'compass', shared_interests: 'leaf', similar_children: 'people',
};
export function RecommendationBadge({ recommendation, example = false, testID }: {
  recommendation?: Recommendation; example?: boolean; testID?: string;
}) {
  const theme = useTheme();
  if (!example && !recommendation?.label) return null;
  return <View testID={testID} style={[styles.badge, { backgroundColor: example ? theme.muted : theme.positiveBackground }]}>
    <Icon name={example ? 'compass' : ICONS[recommendation!.label!]} size={16} color={example ? theme.primaryStrong : theme.positive} />
    <AppText variant="caption" color={example ? 'primaryStrong' : 'positive'} style={styles.label}>
      {example ? 'Pomysł na wyjazd' : RECOMMENDATION_LABELS[recommendation!.label!]}
    </AppText>
  </View>;
}
export function RecommendationReasons({ recommendation }: { recommendation?: Recommendation }) {
  const reasons = cardReasons(recommendation);
  if (!reasons.length) return null;
  return <AppText variant="caption" color="textSecondary">{reasons.map(reasonText).join(' · ')}</AppText>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  label: { fontWeight: '700', flexShrink: 1, fontSize: 12 },
});
