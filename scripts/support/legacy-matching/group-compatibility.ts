// Legacy API reference fixture; never imported by application code.
import type { TravelerProfile } from '../../../src/types/profile.ts';

export interface GroupCompatibility {
  score: number | null;
  reasons: string[];
  limitedData: boolean;
  evaluatedWeight: number;
}
export type GroupCompatibilityRow = {
  score: number | null; reasons: string[]; limited_data: boolean; evaluated_weight: number;
};
export const MIN_GROUP_MATCH_WEIGHT = 60;

// Keep in sync with messaging_private.group_compatibility_values. Only actual
// profile characteristics participate; discovery preferences live in filters.
export function groupCompatibility(a: TravelerProfile, b: TravelerProfile): GroupCompatibility {
  let points = 0, weight = 0;
  const reasons: string[] = [];
  const add = (value: number, importance: number) => { points += value * importance; weight += importance; };
  const sameKind = a.group.kind === b.group.kind;
  add(Number(sameKind), 35);
  if (sameKind) reasons.push('Podobny rodzaj ekipy');
  const ageRequested = a.group.childCount > 0 && b.group.childCount > 0;
  if (ageRequested && a.group.childAgeBands.length && b.group.childAgeBands.length) {
    const common = a.group.childAgeBands.some(band => b.group.childAgeBands.includes(band));
    add(Number(common), 30);
    if (common) reasons.push('Podobny wiek dzieci');
  }
  if (a.group.interests.length && b.group.interests.length) {
    const common = a.group.interests.filter(i => b.group.interests.includes(i)).sort();
    add(2 * common.length / (a.group.interests.length + b.group.interests.length), 25);
    reasons.push(...common.slice(0, 2));
  }
  if (a.group.travelModes.length && b.group.travelModes.length) {
    const same = a.group.travelModes[0] === b.group.travelModes[0];
    add(Number(same), 10);
    if (same) reasons.push('Podobny sposób podróżowania');
  }
  return { score: weight >= MIN_GROUP_MATCH_WEIGHT ? Math.round(points / weight * 100) : null,
    reasons, evaluatedWeight: weight, limitedData: weight < (ageRequested ? 100 : 70) };
}
