/**
 * Today's "done for today" under enable_flame_tiers_v1 — PURE.
 *
 * A dailyProgress doc written by the OLD rule (before the flag) carries workoutCompleted=true
 * for any strength session, with no strengthGoalMet field. With the flag on, TODAY must follow
 * the new gate (strength-day-gate.ts), so such a legacy strength-done flag is re-checked against
 * today's logged sets instead of being trusted. Past days keep their saved fields (owner 26.10).
 *
 * Trusted as-is: strengthGoalMet present (written by the new gate), a non-strength last write
 * (run / walk / hybrid / cycling count as done), a recovery day, or another non-strength
 * workout done today.
 */
import { strengthDayGoalMet } from '@/features/home/utils/strength-day-gate';

/** The dailyProgress fields this gate reads. */
export interface TodayDoneSaved {
  workoutCompleted?: boolean;
  strengthGoalMet?: unknown;
  workoutType?: string | null;
  isRecovery?: boolean;
  dailyStrengthCompletedSets?: number;
}

/** workoutCompleted=true written for a strength session by the pre-flag rule (no strengthGoalMet). */
export function isLegacyStrengthDone(saved: TodayDoneSaved | null | undefined): boolean {
  return !!saved
    && saved.workoutCompleted === true
    && typeof saved.strengthGoalMet !== 'boolean'
    && saved.workoutType === 'strength'
    && saved.isRecovery !== true;
}

export interface TodayDoneInput {
  /** enable_flame_tiers_v1 on. Off → the saved workoutCompleted, unchanged. */
  flameTiers: boolean;
  saved: TodayDoneSaved | null | undefined;
  /** Today's completed strength sets from the local session logs. */
  loggedSets: number;
  /** Today's daily strength target (0 = rest day / no budget). */
  targetSets: number;
  /** A run / walk / group workout is also done today. */
  nonStrengthDoneToday?: boolean;
}

export function todayWorkoutDoneUnderGate(input: TodayDoneInput): boolean {
  const saved = input.saved;
  if (saved?.workoutCompleted !== true) return false;
  if (!input.flameTiers || !isLegacyStrengthDone(saved)) return true;
  if (input.nonStrengthDoneToday) return true;
  const sets = Math.max(Number(input.loggedSets) || 0, Number(saved.dailyStrengthCompletedSets) || 0);
  return strengthDayGoalMet(sets, input.targetSets, 'tiers');
}
