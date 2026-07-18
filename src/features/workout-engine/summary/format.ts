/**
 * Summary layer — formatting + calorie SSOT (Stage 1 of the summary
 * consolidation).
 *
 * Single import surface for the summary composition pages. The two legacy
 * `calculateCalories` implementations are algebraically identical — aerobic
 * `(MET·w·3.5)/200·min` and strength `MET·0.0175·w·min` (3.5/200 = 0.0175).
 * This module collapses them into one `metCalories` primitive with the same
 * MET tables, so every summary screen bills calories the same way. The two
 * legacy fns stay in place (non-summary callers still use them); parity is
 * pinned by `__tests__/format.test.ts`.
 *
 * Pure TS (no React / Firebase) and self-contained — safe to import in the
 * node vitest harness. Ships INERT: imported only by summary/blocks + the
 * composition pages.
 */
import type { ActivityType } from '@/features/parks';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

export { formatPace };

export type SummaryDifficulty = 'easy' | 'medium' | 'hard';

/** MET by activity — mirrors @/lib/calories.utils (running & 'workout' → 8). */
const MET_BY_ACTIVITY: Record<ActivityType, number> = {
  running: 8.0,
  walking: 3.5,
  cycling: 6.0,
  workout: 8.0,
};

/** MET by difficulty — mirrors the strength summary utils. */
const MET_BY_DIFFICULTY: Record<SummaryDifficulty, number> = {
  easy: 3.5,
  medium: 6.0,
  hard: 8.0,
};

const DEFAULT_WEIGHT_KG = 75;

/** Canonical MET calorie formula — the single source of truth. */
function metCalories(met: number, durationMinutes: number, weightKg: number): number {
  return Math.round((met * weightKg * 3.5) / 200 * durationMinutes);
}

/** Aerobic calories (MET by activity). */
export function caloriesFromActivity(
  activity: ActivityType,
  durationMinutes: number,
  weightKg: number = DEFAULT_WEIGHT_KG,
): number {
  const met = MET_BY_ACTIVITY[activity] ?? MET_BY_ACTIVITY.running;
  return metCalories(met, durationMinutes, weightKg || DEFAULT_WEIGHT_KG);
}

/** Strength calories (MET by difficulty). */
export function caloriesFromDifficulty(
  durationSeconds: number,
  difficulty: SummaryDifficulty,
  weightKg: number = DEFAULT_WEIGHT_KG,
): number {
  return metCalories(MET_BY_DIFFICULTY[difficulty], durationSeconds / 60, weightKg || DEFAULT_WEIGHT_KG);
}

/** Seconds → "MM:SS", or "H:MM:SS" once the duration reaches an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
