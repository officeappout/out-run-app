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
 * transaction on the fresh array. It touches nothing else (no currentWeek, no auto-skip), is
 * idempotent (only a 'pending' entry flips), and never throws.
 *
 * running.lastWorkoutDate (owner 23.10.2026): a run that is done or covered also moves the
 * runner's last run date forward in the same transaction (never backwards). Its readers: the
 * running alignment (StatsOverview: 7+ day gap → realign / 21+ → rebuild, only while calm
 * return is off), calm return's daysAway (the LATEST of several dates, so a newer run only
 * shortens it), the planned-run copy's "returning" situation (7+ days) and "has a workout"
 * checks. A partial or discarded run never writes it.
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
  /** When the run happened (ISO); written to running.lastWorkoutDate if newer. Default: now. */
  runDate?: string;
}

/** PURE: the lastWorkoutDate to write — `runDate` when it is newer than `current` (or current is unreadable), else null. */
export function newerLastWorkoutDate(current: unknown, runDate: string): string | null {
  const next = Date.parse(runDate);
  if (!Number.isFinite(next)) return null;
  const prev = typeof current === 'string' ? Date.parse(current) : NaN;
  return Number.isFinite(prev) && prev >= next ? null : new Date(next).toISOString();
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
      const lastDate = newerLastWorkoutDate(snap.get('running.lastWorkoutDate'), c.runDate ?? new Date().toISOString());
      if (!next && !lastDate) return false;
      tx.update(ref, {
        ...(next ? { 'running.activeProgram.schedule': next } : {}),
        ...(lastDate ? { 'running.lastWorkoutDate': lastDate } : {}),
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  } catch (err) {
    console.warn('[plannedRunComplete] marking the planned run done failed (non-fatal)', err);
    return false;
  }
}
