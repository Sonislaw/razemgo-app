import { View } from 'react-native';
import { RecommendationBadge, RecommendationReasons } from '@/components/ui/recommendation';
import type { Recommendation } from '../recommendations/recommendation';

export function GroupCompatibilitySummary({ recommendation, testID }: {
  recommendation?: Recommendation; testID?: string;
}) {
  if (!recommendation?.label) return null;
  return <View style={{ gap: 6 }} testID={testID}>
      <RecommendationBadge recommendation={recommendation} />
      <RecommendationReasons recommendation={recommendation} />
  </View>;
}
