import { integer, object, text } from '../../data/contracts/validate.ts';
import type { TravelGroup } from '../../types/travel';

export const RECOMMENDATION_VERSION = 2;
export type RecommendationLabel = 'similar_plans' | 'shared_interests' | 'similar_children';
export type RecommendationReason = {
  code: 'same_place' | 'same_region' | 'overlapping_dates' | 'date_tolerance' | 'interest' | 'child_age' | 'travel_mode' | 'landscape' | 'animal';
  value?: string;
  days?: number;
};
export interface Recommendation {
  version: 2;
  label: RecommendationLabel | null;
  reasons: RecommendationReason[];
  context: { kind: 'search' | 'trip' | 'profile'; tripId?: string; place?: string; startDate?: string; endDate?: string };
}
export const RECOMMENDATION_LABELS: Record<RecommendationLabel, string> = {
  similar_plans: 'Podobne plany',
  shared_interests: 'Wspólne zainteresowania',
  similar_children: 'Podobny wiek dzieci',
};
export function reasonText(reason: RecommendationReason): string {
  switch (reason.code) {
    case 'same_place': case 'same_region': case 'interest': return reason.value!;
    case 'overlapping_dates': return 'Terminy się pokrywają';
    case 'date_tolerance': return `Termin w tolerancji ±${reason.days} ${reason.days === 1 ? 'dzień' : 'dni'}`;
    case 'child_age': return `Dzieci ${reason.value} lat`;
    case 'travel_mode': return `Podobny sposób podróżowania: ${reason.value === 'Van' ? 'Kampervan' : reason.value}`;
    case 'landscape': return 'Podobny klimat wyjazdu';
    case 'animal': return reason.value === 'dog' ? 'Podróż z psem' : 'Podróż z kotem';
  }
}
export function cardReasons(recommendation?: Recommendation): RecommendationReason[] {
  return recommendation?.label ? recommendation.reasons.slice(0, 2) : [];
}
export function groupRecommendation(viewer: TravelGroup, other: TravelGroup): Recommendation {
  const interests = [...new Set(viewer.interests.filter(value => other.interests.includes(value)))].sort();
  const ages = viewer.childCount > 0 && other.childCount > 0
    ? viewer.childAgeBands.filter(value => other.childAgeBands.includes(value)).sort() : [];
  const reasons: RecommendationReason[] = [
    ...interests.map(value => ({ code: 'interest' as const, value })),
    ...ages.map(value => ({ code: 'child_age' as const, value })),
  ];
  if (viewer.travelModes[0] && viewer.travelModes[0] === other.travelModes[0])
    reasons.push({ code: 'travel_mode', value: viewer.travelModes[0] });
  return { version: 2, label: interests.length ? 'shared_interests' : ages.length ? 'similar_children' : null,
    reasons: viewer.id === other.id ? [] : reasons, context: { kind: 'profile' },
    ...(viewer.id === other.id ? { label: null } : {}) };
}

// JSON RPCs are validated at the boundary, independently of generated schema types.
export function parseRecommendation(value: unknown): Recommendation {
  const row = object(value), context = object(row.context);
  if (row.version !== 2 || ![null, 'similar_plans', 'shared_interests', 'similar_children'].includes(row.label as never)
    || !['search', 'trip', 'profile'].includes(context.kind as string)
    || !Array.isArray(row.reasons) || row.reasons.length > 30) throw Error('Invalid recommendation');
  const parsedContext: Recommendation['context'] = { kind: context.kind as Recommendation['context']['kind'] };
  if (context.kind === 'trip') {
    for (const key of ['tripId', 'place', 'startDate', 'endDate'] as const) {
      text(context[key], key === 'place' ? 160 : 80);
      parsedContext[key] = context[key] as string;
    }
    if (!parsedContext.tripId || !/^\d{4}-\d\d-\d\d$/.test(parsedContext.startDate!)
      || !/^\d{4}-\d\d-\d\d$/.test(parsedContext.endDate!)) throw Error('Invalid recommendation context');
  }
  const codes = ['same_place', 'same_region', 'overlapping_dates', 'date_tolerance', 'interest', 'child_age', 'travel_mode', 'landscape', 'animal'];
  const reasons = row.reasons.map(raw => {
    const reason = object(raw);
    if (!codes.includes(reason.code as string)) throw Error('Invalid recommendation reason');
    const result: RecommendationReason = { code: reason.code as RecommendationReason['code'] };
    if (['same_place', 'same_region', 'interest', 'child_age', 'travel_mode', 'animal'].includes(result.code)) {
      text(reason.value, 160);
      if (!(reason.value as string).trim()) throw Error('Empty recommendation reason');
      result.value = reason.value as string;
    }
    if (result.code === 'date_tolerance') { integer(reason.days, 1, 7); result.days = reason.days as number; }
    return result;
  });
  if (row.label === 'similar_plans' && (!reasons.some(r => r.code === 'same_place' || r.code === 'same_region')
    || !reasons.some(r => r.code === 'overlapping_dates' || r.code === 'date_tolerance'))) throw Error('Unsupported plan recommendation');
  if (row.label === 'shared_interests' && !reasons.some(r => r.code === 'interest')) throw Error('Unsupported interest recommendation');
  if (row.label === 'similar_children' && !reasons.some(r => r.code === 'child_age')) throw Error('Unsupported age recommendation');
  return { version: 2, label: row.label as Recommendation['label'], reasons, context: parsedContext };
}
