import type { LeaderboardCategory } from '@/features/arena/services/ranking.service';

/**
 * Metric-qualified unit label for inter-scope competition totals — never a
 * bare/generic "נקודות". getScopeCompetitionLeaderboard sums activityCredit
 * filtered by `category` (not a literal steps/km field — that per-metric
 * totals upgrade is still a parked pre-launch task), so the honest label is
 * "נק' X" per category, same "נק' X" convention as the Individuals podium
 * (Stage A / format-leaderboard-score.ts). Shared by ScopeCompetitionLeaderboard
 * and ScopeBattleCard so the two surfaces can never drift out of sync.
 */
export const CATEGORY_UNIT_LABEL: Record<LeaderboardCategory, string> = {
  overall: "נק' פעילות",
  cardio: "נק' ריצה",
  strength: "נק' כוח",
};
