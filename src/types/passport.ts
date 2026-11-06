export interface PassportSummary {
  level: number;
  title: string;
  points: number;
  badge_count: number;
}
export interface PassportCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  unit: string;
  thresholds: number[];
}
export interface PassportAchievement {
  id: string;
  count: number | null;
  tier: number;
  awards: { tier: number; earned_at: string }[];
}
export interface TravelerPassport {
  version: 1;
  group_id: string;
  own: boolean;
  summary: PassportSummary;
  categories: PassportAchievement[];
}
