/**
 * Intensity Gating Service
 * 
 * Determines which difficulty levels (1-3 bolts) are available to the user.
 * `maxIntenseWorkoutsPerWeek` is resolved via the **Lead Program** model:
 *   → stored per-program per-level in ProgramLevelSettings
 *   → at runtime the Lead Program (highest user level among same-pattern
 *     programs) dictates the limit
 *
 * Gating Rules:
 * 1. Detraining lock: If daysInactive > 3, lock 3 bolts
 * 2. Admin limit: If intense sessions this week >= maxIntenseWorkoutsPerWeek, lock 3 bolts
 * 3. All rules driven by ProgramLevelSettings — NO hardcoded level ranges
 *
 * Default values (when ProgramLevelSettings has no value):
 *   L1-5:   maxIntenseWorkoutsPerWeek = 0  (locked)
 *   L6-12:  maxIntenseWorkoutsPerWeek = 2  (twice per week)
 *   L13+:   maxIntenseWorkoutsPerWeek = 99 (unlimited)
 *
 * @see lead-program.service.ts  — resolves maxIntenseWorkoutsPerWeek at runtime
 * @see TRAINING_LOGIC.md Rule 2.3 (Reactivation Protocol)
 */

import type { DifficultyLevel } from '../logic/WorkoutGenerator';

// ============================================================================
// TYPES
// ============================================================================

export interface IntensityGatingResult {
  /** Available difficulty levels the user can select */
  availableDifficulties: DifficultyLevel[];
  /** Whether 3 bolts is currently locked */
  isIntenseLocked: boolean;
  /** Human-readable reason for the lock (if any) */
  lockReason?: string;
}

export interface IntensityGatingContext {
  /** User's current level in the active program */
  userLevel: number;
  /** Days since last workout (for detraining detection) */
  daysInactive: number;
  /** Number of 3-bolt sessions completed this week (from WeeklyVolumeStore) */
  weeklyIntenseCount: number;
  /** Admin-configured max intense sessions per week (from Lead Program resolution).
   *  If undefined, the default fallback is applied. */
  maxIntenseWorkoutsPerWeek?: number;
}

// ============================================================================
// DEFAULT FALLBACK
// ============================================================================

/**
 * Get the default maxIntenseWorkoutsPerWeek when ProgramLevelSettings
 * doesn't have a value set. This is the safety fallback only.
 * 
 * Coaches can override these via the Admin Panel at any time.
 */
export function getDefaultMaxIntensePerWeek(userLevel: number): number {
  if (userLevel <= 5) return 0;   // Beginners: no intense sessions
  if (userLevel <= 12) return 2;  // Intermediate: 2 per week
  return 99;                       // Advanced: unlimited
}

// ============================================================================
// MAIN GATING FUNCTION
// ============================================================================

/**
 * Determine which difficulty levels are available to the user.
 * 
 * This is called by the UI (WorkoutPreferencesModal, HeroWorkoutCard)
 * and by the workout generation pipeline.
 */
export function getAvailableDifficulties(ctx: IntensityGatingContext): IntensityGatingResult {
  const available: DifficultyLevel[] = [1, 2]; // 1 and 2 bolts always available

  // ── Rule 1: Detraining lock ─────────────────────────────────────────
  if (ctx.daysInactive > 3) {
    return {
      availableDifficulties: available,
      isIntenseLocked: true,
      lockReason: `נעול: חזרת אחרי ${ctx.daysInactive} ימי הפסקה — נתחיל בנוח`,
    };
  }

  // ── Rule 2: Admin limit from ProgramLevelSettings ────────────────────
  const maxPerWeek = ctx.maxIntenseWorkoutsPerWeek ?? getDefaultMaxIntensePerWeek(ctx.userLevel);

  if (ctx.weeklyIntenseCount >= maxPerWeek) {
    // Locked: quota reached for this week
    const lockMsg = maxPerWeek === 0
      ? 'נעול: רמה זו לא כוללת אימוני כוח מקסימלי'
      : `נעול: הגעת ל-${maxPerWeek} אימוני כוח מקסימלי השבוע`;
    
    return {
      availableDifficulties: available,
      isIntenseLocked: true,
      lockReason: lockMsg,
    };
  }

  // ── No locks — 3 bolts available ─────────────────────────────────────
  available.push(3);
  return {
    availableDifficulties: available,
    isIntenseLocked: false,
  };
}
