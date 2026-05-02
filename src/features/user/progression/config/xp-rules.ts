/**
 * XP Rules — Centralized Configuration
 *
 * Single source of truth for all global-XP constants.
 * Domain-track progression (push/pull/legs/core percentages) is a separate
 * system managed by progression.service.ts and is NOT governed by these values.
 *
 * Difficulty "bolts" (1-3) map to the lightning-bolt icons shown in the UI.
 */

// Difficulty bolt (1|2|3) → XP earned per minute of workout
export const DIFFICULTY_MULTIPLIER: Record<1 | 2 | 3, number> = {
  1: 2.0,
  2: 3.5,
  3: 5.0,
};

// Volume bonuses (additive, applied before streak multiplier)
export const XP_PER_SET = 3;
export const XP_PER_REP = 0.3;

// Streak multiplier: 1 + min(streak, MAX_DAYS) * INCREMENT
// Day 1 = 1.00×, Day 7 = 1.07×, Day 30+ = 1.30× (hard cap)
export const STREAK_MULTIPLIER_INCREMENT = 0.01;
export const STREAK_MULTIPLIER_MAX_DAYS = 30;

// Running / Walking XP constants (applied before streak multiplier)
// Formula: FinalXP = round((Minutes × XP_PER_MINUTE_RUNNING + Km × XP_PER_KM_BONUS) × StreakMultiplier)
export const XP_PER_MINUTE_RUNNING = 3;   // 3 XP per minute of cardio
export const XP_PER_KM_BONUS = 10;        // +10 XP per km — rewards intensity & distance

// Commute XP constants (A-to-B navigation, applied before streak multiplier)
// Formula: FinalXP = round((Minutes × COMMUTE_BASE_XP_PER_MINUTE + Km × COMMUTE_BASE_XP_PER_KM) × StreakMultiplier)
//
// Trade-off intent (vs the workout running rate):
//   • Per-minute is HALVED (3 → 1.5) — a school-run shouldn't pay
//     out the same as a deliberate training session, but we still
//     want movement to be rewarded so commuters stay engaged.
//   • Per-km is REDUCED to 25% (10 → 2.5) — distance bonuses are a
//     reward for athletic effort, not for "I drive 12 km to work";
//     the per-minute term carries most of the commute reward weight.
//   • Streak multiplier is SHARED with workouts on purpose — a daily
//     commute IS a streak-builder, and that's exactly what we want
//     to reinforce.
//
// Net effect: a brisk 15-min walk to work earns ≈ 25 XP at streak 1.
// A 15-min training run earns ≈ 65 XP at streak 1. Same minutes,
// very different pay-out — matching the differing effort profile.
export const COMMUTE_BASE_XP_PER_MINUTE = 1.5;
export const COMMUTE_BASE_XP_PER_KM = 2.5;

// Goal bonus (flat XP, added after streak multiplier)
// ADMIN OVERRIDE: These are compile-time fallbacks only.
// The live values are stored in Firestore: app_config/xp_settings
// (goalBonusBase, goalBonusIncrement, goalBonusCap) and managed via /admin/levels.
export const GOAL_BONUS_BASE = 50;
export const GOAL_BONUS_INCREMENT = 10;
export const GOAL_BONUS_CAP = 150;

// 10-level thresholds — hardcoded fallback when Firestore `levels` collection is unavailable.
// The admin panel (/admin/levels) is the SOURCE OF TRUTH for minXP/maxXP values.
// useLevelConfig hook reads Firestore first and falls back to these constants.
// Levels 1→3 are intentionally easy (~2–3 weeks) to build early confidence.
// Level 10 ("God Mode") requires sustained elite training over multiple years.
export const GLOBAL_LEVEL_THRESHOLDS = [
  { level: 1,  minXP: 0 },
  { level: 2,  minXP: 300 },
  { level: 3,  minXP: 800 },
  { level: 4,  minXP: 2_000 },
  { level: 5,  minXP: 5_000 },
  { level: 6,  minXP: 11_000 },
  { level: 7,  minXP: 22_000 },
  { level: 8,  minXP: 40_000 },
  { level: 9,  minXP: 65_000 },
  { level: 10, minXP: 100_000 },
] as const;
