import { emptyPassport, PASSPORT_CATEGORIES, PASSPORT_TIER_POINTS, passportLevel } from './passport-data.ts';

export function demoPassport(groupId: string, own = true) {
  const data = emptyPassport(groupId, own);
  const counts: Record<string, number> = { profile: 1, plans: 3, messages: 56, contacts: 2, trip_favorites: 4,
    group_favorites: 2, active_days: 8, destinations: 3, landscapes: 2, campgrounds: 1 };
  data.categories = PASSPORT_CATEGORIES.map(c => {
    const count = counts[c.id] ?? 0;
    const tier = c.thresholds.filter(n => count >= n).length;
    return { id: c.id, tier, count: own ? count : null,
      awards: Array.from({ length: tier }, (_, i) => ({ tier: i + 1, earned_at: '2026-11-05T12:00:00Z' })) };
  });
  const points = data.categories.reduce((sum, c) => sum + PASSPORT_TIER_POINTS.slice(0, c.tier).reduce((a, b) => a + b, 0), 0);
  data.summary = { ...passportLevel(points), points, badge_count: data.categories.reduce((sum, c) => sum + c.tier, 0) };
  return data;
}
