import catalog from '../../../shared/passport-catalog.json' with { type: 'json' };
import { integer, object, text } from '../../data/contracts/validate.ts';
import type { PassportCategory, PassportSummary, TravelerPassport } from '../../types/passport';

export const PASSPORT_CATEGORIES: readonly PassportCategory[] = catalog.categories;
export const PASSPORT_LEVELS = catalog.levels;
export const PASSPORT_TIERS = catalog.tiers;
export const PASSPORT_TIER_POINTS = catalog.tierPoints;
export const PASSPORT_BADGE_COUNT = PASSPORT_CATEGORIES.reduce((sum, c) => sum + c.thresholds.length, 0);
export const passportLevel = (points: number) => [...PASSPORT_LEVELS].reverse().find(l => points >= l.points)!;
export const EMPTY_PASSPORT_SUMMARY: PassportSummary = { ...PASSPORT_LEVELS[0], points: 0, badge_count: 0 };

export function parsePassportSummary(input: unknown): PassportSummary {
  const value = object(input);
  integer(value.level, 1, PASSPORT_LEVELS.length);
  integer(value.points, 0, 1000000);
  integer(value.badge_count, 0, PASSPORT_BADGE_COUNT);
  text(value.title, 80);
  const expected = passportLevel(value.points);
  if (expected.level !== value.level || expected.title !== value.title) throw Error('Invalid passport level');
  return value as unknown as PassportSummary;
}
export function parseTravelerPassport(input: unknown): TravelerPassport {
  const value = object(input);
  if (value.version !== 1 || typeof value.own !== 'boolean') throw Error('Invalid passport version');
  text(value.group_id, 128);
  const summary = parsePassportSummary(value.summary);
  if (!Array.isArray(value.categories) || value.categories.length !== PASSPORT_CATEGORIES.length) throw Error('Invalid passport categories');
  const seen = new Set<string>();
  let points = 0, badges = 0;
  for (const item of value.categories) {
    const row = object(item);
    text(row.id, 80);
    const category = PASSPORT_CATEGORIES.find(c => c.id === row.id);
    if (!category || seen.has(row.id)) throw Error('Invalid passport category');
    seen.add(row.id);
    integer(row.tier, 0, category.thresholds.length);
    if (value.own) {
      integer(row.count);
      if (category.thresholds.filter(n => Number(row.count) >= n).length !== row.tier) throw Error('Invalid passport progress');
    } else if (row.count !== null) throw Error('Public passport contains private progress');
    if (!Array.isArray(row.awards) || row.awards.length !== row.tier) throw Error('Invalid passport awards');
    row.awards.forEach((item, i) => {
      const award = object(item);
      if (award.tier !== i + 1) throw Error('Invalid passport tier');
      text(award.earned_at, 80);
      if (!Number.isFinite(Date.parse(award.earned_at))) throw Error('Invalid passport award date');
      points += PASSPORT_TIER_POINTS[i];
      badges++;
    });
  }
  if (summary.points !== points || summary.badge_count !== badges) throw Error('Invalid passport totals');
  return value as unknown as TravelerPassport;
}
export function levelProgress(summary: PassportSummary) {
  const current = passportLevel(summary.points);
  const next = PASSPORT_LEVELS.find(l => l.level === current.level + 1);
  return { current, next, remaining: next ? next.points - summary.points : 0,
    fraction: next ? (summary.points - current.points) / (next.points - current.points) : 1 };
}
export function badgeProgress(category: PassportCategory, tier: number, count: number) {
  const target = category.thresholds[tier];
  const previous = category.thresholds[tier - 1] ?? 0;
  return { target, remaining: target === undefined ? 0 : Math.max(0, target - count),
    fraction: target === undefined ? 1 : Math.max(0, Math.min(1, (count - previous) / (target - previous))) };
}
export function emptyPassport(groupId: string, own = true): TravelerPassport {
  return { version: 1, group_id: groupId, own, summary: { ...EMPTY_PASSPORT_SUMMARY },
    categories: PASSPORT_CATEGORIES.map(c => ({ id: c.id, count: own ? 0 : null, tier: 0, awards: [] })) };
}
