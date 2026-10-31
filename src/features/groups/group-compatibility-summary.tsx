import { View } from 'react-native';
import { RecommendationBadge, RecommendationDetails, RecommendationReasons } from '@/components/ui/recommendation';
import type { Recommendation } from '../recommendations/recommendation';

export function GroupCompatibilitySummary({ recommendation, testID, detailed = false }: {
  recommendation?: Recommendation; testID?: string; detailed?: boolean;
}) {
  if (!recommendation || (!detailed && !recommendation.label)) return null;
  return <View style={{ gap: 6 }} testID={testID}>
    {detailed ? <RecommendationDetails recommendation={recommendation} kind="group" /> : <>
      <RecommendationBadge recommendation={recommendation} />
      <RecommendationReasons recommendation={recommendation} />
    </>}
  </View>;
}
