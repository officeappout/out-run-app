/**
 * Achievement System — Type Definitions
 *
 * Two achievement types:
 *   - 'one_time'  Single unlock when condition is first met.
 *   - 'tiered'    Three tiers (bronze → silver → gold), each independently
 *                 unlockable and each awarding its own XP amount.
 *
 * Storage on user doc:
 *   progression.unlockedAchievements: Record<string, UnlockedAchievementEntry>
 *
 * Keys for one_time:  achievementId           (e.g. "first_5k")
 * Keys for tiered:    achievementId_tierKey    (e.g. "weekly_streak_bronze")
 */

export type AchievementCategory =
  | 'running'
  | 'strength'
  | 'consistency'
  | 'social'
  | 'leagues'
  | 'map'
  | 'special';

export const CATEGORY_LABELS_HE: Record<AchievementCategory, string> = {
  running:     'ריצה',
  strength:    'כוח',
  consistency: 'עקביות',
  social:      'חברתי',
  leagues:     'ליגות',
  map:         'מפה ופארקים',
  special:     'מיוחד',
};

export const CATEGORY_ORDER: AchievementCategory[] = [
  'running', 'strength', 'consistency', 'social', 'leagues', 'map', 'special',
];

export type AchievementType = 'tiered' | 'one_time';
export type TierKey = 'bronze' | 'silver' | 'gold';

export const TIER_LABELS_HE: Record<TierKey, string> = {
  bronze: 'ברונזה',
  silver: 'כסף',
  gold:   'זהב',
};

export const TIER_ORDER: TierKey[] = ['bronze', 'silver', 'gold'];

export const TIER_COLORS: Record<TierKey, { bg: string; text: string; border: string }> = {
  bronze: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300' },
  silver: { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300' },
  gold:   { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400' },
};

export const TIER_EMOJI: Record<TierKey, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold:   '🥇',
};

// ─────────────────────────────────────────────────────────────────────────────
// Condition system
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionType =
  | 'total_running_km'
  | 'longest_run_km'
  | 'runs_in_7_days'
  | 'total_workouts'
  | 'total_strength_workouts'
  | 'days_active'
  | 'streak_days'
  | 'strength_in_7_days'
  | 'strength_in_30_days'
  | 'outdoor_workouts'
  | 'pullup_max_reps'
  | 'pushup_max_reps'
  | 'squat_max_reps'
  | 'plank_max_seconds'
  | 'followers_count'
  | 'following_count'
  | 'groups_joined'
  | 'partner_workouts'
  | 'unique_parks'
  | 'park_sessions'
  | 'league_rank_lte'
  | 'league_weekly_wins'
  | 'bool_workout_before_7am'
  | 'bool_workout_on_friday'
  | 'bool_workout_in_rain'
  | 'bool_messages_sent';

export interface Condition {
  type: ConditionType;
  /** For boolean conditions, value is ignored (use 1). */
  value: number;
}

export interface TierConfig {
  condition: Condition;
  xp: number;
}

export interface AchievementDefinition {
  id: string;
  name_he: string;
  description_he: string;
  category: AchievementCategory;
  type: AchievementType;
  /** Emoji placeholder — replaced by iconUrl when Bunny CDN assets are ready. */
  emoji: string;
  iconUrl: string;

  // one_time fields
  condition?: Condition;
  xp?: number;

  // tiered fields
  tiers?: {
    bronze: TierConfig;
    silver: TierConfig;
    gold:   TierConfig;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// User stats required for condition evaluation
// ─────────────────────────────────────────────────────────────────────────────

export interface UserAchievementStats {
  // From progressionStore — always hydrated
  daysActive: number;
  currentStreak: number;

  // From workout history — computed in useAchievements hook
  totalWorkouts: number;
  totalRunningKm: number;
  longestRunKm: number;
  totalStrengthWorkouts: number;
  runsInLast7Days: number;
  strengthWorkoutsInLastWeek: number;
  strengthWorkoutsInLastMonth: number;
  outdoorWorkouts: number;
  hasWorkoutBefore7am: boolean;
  hasWorkoutOnFriday: boolean;

  // Exercise PRs — requires exercise history fetch (default 0 until available)
  pullupMaxReps: number;
  pushupMaxReps: number;
  squatMaxReps: number;
  plankMaxSeconds: number;

  // Social — from social/connections store (default 0)
  followersCount: number;
  followingCount: number;
  groupsJoined: number;

  // Future / requires external data (default false/0 on first pass)
  partnerWorkouts: number;
  uniqueParks: number;
  parkSessions: number;
  leagueRank: number | null;
  leagueWeeklyWins: number;
  hasWorkoutInRain: boolean;
  messagesSent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — stored at users/{id}.progression.unlockedAchievements
// ─────────────────────────────────────────────────────────────────────────────

export interface UnlockedAchievementEntry {
  unlockedAt: string;  // ISO date string
  xpAwarded: number;
  tier?: TierKey;      // undefined for one_time achievements
}

/**
 * Map of all unlocked achievements/tiers for a user.
 *
 * Keys:
 *   one_time  → achievementId              ("first_5k")
 *   tiered    → achievementId_tierKey      ("weekly_streak_bronze")
 */
export type UnlockedAchievementsMap = Record<string, UnlockedAchievementEntry>;

/** A single unlock event returned from the check function — used to drive the toast queue. */
export interface NewlyUnlockedItem {
  achievement: AchievementDefinition;
  tier?: TierKey;
  xpAwarded: number;
}
