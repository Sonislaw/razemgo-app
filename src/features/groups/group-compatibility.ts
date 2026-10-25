import type { TravelerProfile } from '../../types/profile';

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

// Keep in sync with messaging_private.group_compatibility in the SQL migration.
// The live app receives only its result; other crews' preferences stay in the DB.
export function groupCompatibility(a: TravelerProfile, b: TravelerProfile): GroupCompatibility {
  let points = 0, weight = 0;
  const reasons: string[] = [];
  const add = (value: number, importance: number) => { points += value * importance; weight += importance; };
  const acceptsKind = (wanted: string[], actual: string) => !wanted.length || wanted.includes(actual);
  if (a.matching.groupKinds.length || b.matching.groupKinds.length) {
    const first = acceptsKind(a.matching.groupKinds, b.group.kind);
    const second = acceptsKind(b.matching.groupKinds, a.group.kind);
    add((Number(first) + Number(second)) / 2, 35);
    if (first && second) reasons.push('Pasujący rodzaj ekipy');
  }
  const ageRequested = Boolean(a.matching.childAgeBands.length || b.matching.childAgeBands.length);
  if (ageRequested) {
    const acceptsAge = (wanted: string[], other: TravelerProfile): boolean | null =>
      !wanted.length ? true : !other.group.childCount ? false : !other.group.childAgeBands.length ? null
        : wanted.some(band => other.group.childAgeBands.includes(band as typeof other.group.childAgeBands[number]));
    const first = acceptsAge(a.matching.childAgeBands, b);
    const second = acceptsAge(b.matching.childAgeBands, a);
    if (first !== null && second !== null) {
      add((Number(first) + Number(second)) / 2, 30);
      if (first && second) reasons.push('Pasujący wiek dzieci');
    }
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
