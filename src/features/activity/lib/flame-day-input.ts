/**
 * Assemble one day's flameLevelForDay input from what the app already holds — PURE.
 *   • server-saved dailyProgress (`saved`: strengthGoalMet, aerobicWorkoutMinutes, workoutCompleted,
 *     stepGoalMet) — the source for every day, so other devices count;
 *   • the activity store's day (streak minutes / steps);
 *   • local weekly-volume session logs — TODAY only, as the in-progress fallback;
 *   • `pending` — this session before its own write lands (strength summary).
 */
import { flameLevelForDay, type FlameActivityDay, type FlameDay } from './flame-level';
import { strengthDayGoalMet } from '@/features/home/utils/strength-day-gate';

/** This session's numbers before its own activity / volume write lands (strength summary). */
export interface PendingSession {
  strengthMinutes?: number;
  /** Non-strength minutes (streak only — not the aerobic goal unless recorded as run / walk). */
  cardioMinutes?: number;
  strengthSets?: number;
}

/** The goal fields a dailyProgress doc may carry. */
export interface SavedDayGoals {
  strengthGoalMet?: boolean;
  aerobicWorkoutMinutes?: number;
  workoutCompleted?: boolean;
  stepGoalMet?: boolean;
  /** workoutCompleted came from the pre-flag rule for a strength session (no strengthGoalMet). */
  legacyStrengthDone?: boolean;
}

export interface FlameDayContext {
  activity: FlameActivityDay | null | undefined;
  isToday: boolean;
  /** Sets in the local session logs for that day (used for today only). */
  loggedSets: number;
  /** Weekly set budget of the lead program (0 = none). */
  weeklyTarget: number;
  /** Planned training days per week. */
  scheduleDays: number;
  /** Is that day a planned strength day? */
  isTrainingDay: boolean;
  saved?: SavedDayGoals | null;
  aerobicPlanDone?: boolean;
  pending?: PendingSession | null;
}

function addMinutes(
  activity: FlameActivityDay | null | undefined,
  pending: PendingSession,
): FlameActivityDay {
  const cats = { ...(activity?.categories ?? {}) };
  const bump = (key: string, add: number | undefined) => {
    const n = Math.max(0, Number(add) || 0);
    if (!n) return;
    const cur = cats[key] ?? {};
    cats[key] = { ...cur, minutes: (Number(cur?.minutes) || 0) + n, sessions: (Number(cur?.sessions) || 0) + 1 };
  };
  bump('strength', pending.strengthMinutes);
  bump('cardio', pending.cardioMinutes);
  return { ...(activity ?? {}), categories: cats };
}

/** Daily target the same way dailyStrengthTarget.ts derives it (rest day → 0). */
export function dailyTargetFor(weeklyTarget: number, scheduleDays: number, isTrainingDay: boolean): number {
  if (!isTrainingDay) return 0;
  return Math.ceil(Math.max(0, Number(weeklyTarget) || 0) / Math.max(1, Number(scheduleDays) || 0));
}

export function flameDayFromContext(ctx: FlameDayContext): FlameDay {
  const pending = ctx.isToday ? ctx.pending ?? null : null;
  const activity = pending ? addMinutes(ctx.activity, pending) : ctx.activity;
  const localSets = ctx.isToday ? (Number(ctx.loggedSets) || 0) + (Number(pending?.strengthSets) || 0) : 0;
  const saved = ctx.saved ?? null;
  const targetSets = dailyTargetFor(ctx.weeklyTarget, ctx.scheduleDays, ctx.isTrainingDay);
  // TODAY: a legacy (pre-flag) strength workoutCompleted is re-checked against the new gate
  // (today-done-gate.ts); past days keep their saved fields.
  const savedDone = !!saved?.workoutCompleted
    && !(ctx.isToday && saved.legacyStrengthDone && !strengthDayGoalMet(localSets, targetSets));
  return flameLevelForDay({
    activity,
    strengthSets: localSets,
    strengthTargetSets: targetSets,
    strengthGoalSaved: saved?.strengthGoalMet,
    aerobicMinutes: saved?.aerobicWorkoutMinutes,
    aerobicPlanDone: ctx.aerobicPlanDone,
    qualifiesSaved: savedDone || !!saved?.stepGoalMet,
    workoutLogged: !!saved?.workoutCompleted
      || (!!pending && ((Number(pending.strengthMinutes) || 0) > 0 || (Number(pending.cardioMinutes) || 0) > 0 || localSets > 0)),
  });
}
