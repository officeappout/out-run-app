import type { LeaderboardCategory } from '@/features/arena/services/ranking.service';
import he from '@/messages/he/community.json';
import type { CommunityKey } from './league-t';

/**
 * Metric-qualified unit label for inter-scope competition totals — never a
 * bare/generic "נקודות". getScopeCompetitionLeaderboard sums activityCredit
 * filtered by `category` (not a literal steps/km field — that per-metric
 * totals upgrade is still a parked pre-launch task), so the honest label is
 * "נק' X" per category, same "נק' X" convention as the Individuals podium
 * (Stage A / format-leaderboard-score.ts). Shared by ScopeCompetitionLeaderboard
 * and ScopeBattleCard so the two surfaces can never drift out of sync.
 */
export const CATEGORY_UNIT_LABEL_KEYS = {
  overall: 'leagues.categoryUnit.overall',
  cardio: 'leagues.categoryUnit.cardio',
  strength: 'leagues.categoryUnit.strength',
} as const satisfies Record<LeaderboardCategory, CommunityKey>;

/**
 * i18n (namespace `community`, keys `leagues.categoryUnit.*`): migrated callers render
 * `t(CATEGORY_UNIT_LABEL_KEYS[category])` (the league boards since batch x). This map stays for any
 * caller still reading it directly: it reads the HEBREW catalog — same text as before, Hebrew in every locale.
 */
export const CATEGORY_UNIT_LABEL: Record<LeaderboardCategory, string> = {
  overall: he[CATEGORY_UNIT_LABEL_KEYS.overall],
  cardio: he[CATEGORY_UNIT_LABEL_KEYS.cardio],
  strength: he[CATEGORY_UNIT_LABEL_KEYS.strength],
};
