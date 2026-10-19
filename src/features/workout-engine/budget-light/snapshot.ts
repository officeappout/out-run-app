/**
 * Budget light mode — build the policy's StrengthBudgetSnapshot from useWeeklyVolumeStore's
 * plain state (pure: the caller passes `getState()` and `now`). Persisted session logs come
 * back from storage with `completedAt` as a string, so both shapes are accepted.
 */

import type { StrengthBudgetSnapshot } from './policy';

export interface VolumeStoreLike {
  strength?: { weeklyBudget?: number; totalSetsCompleted?: number } | null;
  sessionLogs?: Array<{ completedAt?: Date | string | number | null; setsCompleted?: number; isRecovery?: boolean }> | null;
}

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function strengthSetsDoneToday(logs: VolumeStoreLike['sessionLogs'], now: Date): number {
  let sum = 0;
  for (const log of logs ?? []) {
    if (!log || log.isRecovery) continue;
    const at = log.completedAt instanceof Date ? log.completedAt : log.completedAt != null ? new Date(log.completedAt) : null;
    if (!at || Number.isNaN(at.getTime()) || !sameLocalDay(at, now)) continue;
    sum += Number.isFinite(log.setsCompleted) ? (log.setsCompleted as number) : 0;
  }
  return sum;
}

export function snapshotFromVolumeStore(
  state: VolumeStoreLike | null | undefined,
  now: Date,
  trainingDaysPerWeek?: number | null,
): StrengthBudgetSnapshot | null {
  const s = state?.strength;
  if (!s) return null;
  return {
    weeklyBudget: Number(s.weeklyBudget ?? 0),
    totalSetsCompleted: Number(s.totalSetsCompleted ?? 0),
    setsDoneToday: strengthSetsDoneToday(state?.sessionLogs, now),
    trainingDaysPerWeek: trainingDaysPerWeek ?? null,
  };
}

/** profile.lifestyle.scheduleDays → training days per week (null when not set). */
export function trainingDaysOf(profile: { lifestyle?: { scheduleDays?: unknown[] | null } | null } | null | undefined): number | null {
  const n = profile?.lifestyle?.scheduleDays?.length ?? 0;
  return n > 0 ? n : null;
}
