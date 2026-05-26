/**
 * summary.utils — pure types, constants, and math helpers used across the
 * StrengthSummaryPage decomposition.
 *
 * Owned exclusively by `summary-atoms/*`, `hooks/useSummaryAnalytics`,
 * `hooks/useGoalEvaluation`, and `StrengthSummaryPage` itself.
 *
 * No React, no hooks, no Firebase — just deterministic math and types so the
 * decomposed modules can all depend on this file without cycling through the
 * page component.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Steps S-1 … S-3).
 */

// ============================================================================
// TYPES
// ============================================================================

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CompletedExercise {
  id: string;
  name: string;
  category: 'warmup' | 'superset' | 'stretch' | 'main';
  /** Array of reps per set, e.g. [30, 30, 30]. */
  sets: number[];
  totalReps: number;
  isPersonalRecord?: boolean;
}

export interface LevelGoalDef {
  id: string;
  exerciseName: string;
  targetValue: number;
  unit: 'reps' | 'seconds';
  /** Hebrew display label. */
  label: string;
  /** Admin-defined % awarded when the goal is met. */
  progressBonus?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** MET values by difficulty (drives the calorie formula). */
export const MET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 3.5,
  medium: 6.0,
  hard: 8.0,
};

/**
 * Coin ratio — 1:1 with calories for simplicity.
 * 1 calorie burned ⇒ 1 coin awarded.
 */
export const COIN_RATIO = 1;

/**
 * Bonus coins by difficulty level — multiplier on top of base coins.
 * Currently unused by `calculateCoins` (kept as a public constant for the
 * barrel export contract).
 */
export const COIN_BONUS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.25,
  hard: 1.5,
};

/** Default user weight for calorie calculation (kg). */
export const DEFAULT_WEIGHT_KG = 75;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate calories using the MET formula:
 *   calories = MET × 0.0175 × weightKg × durationMinutes
 */
export function calculateCalories(
  durationSeconds: number,
  difficulty: Difficulty,
  weightKg: number = DEFAULT_WEIGHT_KG,
): number {
  const met = MET_BY_DIFFICULTY[difficulty];
  const durationMinutes = durationSeconds / 60;
  return Math.round(met * 0.0175 * weightKg * durationMinutes);
}

/** Calculate coins earned — currently a 1:1 ratio with calories. */
export function calculateCoins(calories: number): number {
  return Math.round(calories * COIN_RATIO);
}

/** Format a duration from seconds to MM:SS. */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Group completed exercises by category (warmup / main / superset / stretch). */
export function groupExercisesByCategory(
  exercises: CompletedExercise[],
): Record<string, CompletedExercise[]> {
  return exercises.reduce((acc, ex) => {
    const category = ex.category || 'main';
    if (!acc[category]) acc[category] = [];
    acc[category].push(ex);
    return acc;
  }, {} as Record<string, CompletedExercise[]>);
}
