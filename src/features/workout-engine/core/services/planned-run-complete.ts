/**
 * Mark the planned run a saved run completed (enable_home_v2 + enable_run_done_state_v1).
 *
 * The one write the "KNOWN GAP" (PlannedRun/index.tsx) never had: after a run is saved nothing
 * ever flipped its schedule entry to 'completed', so home kept offering Start. The decision is
 * pure (run-coverage.ts); this is Firestore glue modelled on completePendingPlannedWalk.
 *
 * Races: the running schedule is ONE array field (running.activeProgram.schedule) that the
 * calm-return catch-up (applyRunCatchUp) and rollBackOneWeek also rewrite. So this never sends
 * a stale local copy: it reads the document INSIDE a transaction, changes only the one matching
 * pending entry, and writes the array back; a concurrent write makes Firestore retry the
 * transaction on the fresh array. It touches nothing else (no currentWeek, no auto-skip, no
 * lastWorkoutDate), is idempotent (only a 'pending' entry flips), and never throws.
 */
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ActiveRunningProgram } from '../types/running.types';

type ScheduleEntry = ActiveRunningProgram['schedule'][number];

export interface PlannedRunCompletion {
  week: number;
  day: number;
  /** The saved workout doc that completed the entry. */
  workoutId?: string | null;
  coverage: 'plan' | 'free';
  /** Optional, as markSessionComplete records them (avg pace sec/km, share of the target 0..1). */
  avgPace?: number;
  completionRate?: number;
}

/** PURE: the schedule with the matching PENDING entry completed, or null when nothing changes. */
export function completeEntryInSchedule(
  schedule: readonly ScheduleEntry[] | null | undefined,
  c: PlannedRunCompletion,
): ScheduleEntry[] | null {
  if (!Array.isArray(schedule)) return null;
  let changed = false;
  const next = schedule.map((entry) => {
    if (entry.week !== c.week || entry.day !== c.day) return entry;
    if (entry.status !== 'pending' && entry.status !== undefined) return entry;
    changed = true;
    return {
      ...entry,
      status: 'completed' as const,
      coverage: c.coverage,
      ...(c.workoutId ? { coveredBy: c.workoutId } : {}),
      ...(Number.isFinite(c.avgPace) && Number.isFinite(c.completionRate)
        ? { actualPerformance: { avgPace: c.avgPace as number, completionRate: c.completionRate as number } }
        : {}),
    };
  });
  return changed ? next : null;
}

export async function completePlannedRunEntry(uid: string, c: PlannedRunCompletion): Promise<boolean> {
  if (!uid || !(c.week > 0) || !(c.day > 0)) return false;
  try {
    const ref = doc(db, 'users', uid);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const schedule = snap.get('running.activeProgram.schedule') as ScheduleEntry[] | undefined;
      const next = completeEntryInSchedule(schedule, c);
      if (!next) return false;
      tx.update(ref, { 'running.activeProgram.schedule': next, updatedAt: serverTimestamp() });
      return true;
    });
  } catch (err) {
    console.warn('[plannedRunComplete] marking the planned run done failed (non-fatal)', err);
    return false;
  }
}
