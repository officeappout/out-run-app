/**
 * Assemble one day's flameLevelForDay input from what the device already holds — PURE.
 * The hook (useFlameDays) feeds it the activity store, the weekly-volume session logs and
 * the lead program's weekly set budget; no extra reads.
 */
import { flameLevelForDay, type FlameActivityDay, type FlameDay } from './flame-level';

/** This session's numbers before its own activity / volume write lands (strength summary). */
export interface PendingSession {
  strengthMinutes?: number;
  cardioMinutes?: number;
  strengthSets?: number;
}

export interface FlameDayContext {
  activity: FlameActivityDay | null | undefined;
  /** Sets logged in the session logs for that day. */
  loggedSets: number;
  /** Weekly set budget of the lead program (0 = none). */
  weeklyTarget: number;
  /** Planned training days per week. */
  scheduleDays: number;
  /** Is that day a planned strength day? */
  isTrainingDay: boolean;
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
  const pending = ctx.pending ?? null;
  const activity = pending ? addMinutes(ctx.activity, pending) : ctx.activity;
  const sets = (Number(ctx.loggedSets) || 0) + (Number(pending?.strengthSets) || 0);
  return flameLevelForDay({
    activity,
    strengthSets: sets,
    strengthTargetSets: dailyTargetFor(ctx.weeklyTarget, ctx.scheduleDays, ctx.isTrainingDay),
    workoutLogged: !!pending && ((Number(pending.strengthMinutes) || 0) > 0 || (Number(pending.cardioMinutes) || 0) > 0 || sets > 0),
  });
}
