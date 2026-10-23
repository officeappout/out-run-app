/**
 * Weekly RUN count (enable_home_v2, owner 20.10.2026): the weekly "ריצה" bar and the
 * after-workout "next run" logic count only runs — never walks. The weekly summary's
 * `categorySessions.cardio` lumps runs, walks and cycling together, so the runs come from
 * this week's workout docs instead. PURE.
 *
 * A run = workoutType / activityType 'running', or a combined workout (hybrid) that has a
 * running leg (owner, 20.10.2026 — counted per part, see hybrid-counting.ts; the hybrid doc's
 * own activityType is always 'hybrid', so the leg types decide). Weekly km stays combined.
 */
import { doneKindsOfDoc } from '@/features/workout-engine/hybrid/hybrid-counting';
import { runCountsTowardWeek } from '@/lib/run-coverage';

export interface RunSessionDoc {
  workoutType?: string | null;
  activityType?: string | null;
  /** Combined workouts: the per-leg records (aerobicType decides run vs walk). */
  segments?: unknown;
  /** Plain runs (seconds / km / the planned-run link) — read only for the run-done minimum. */
  duration?: number;
  distance?: number;
  runMeta?: { plan?: { week?: number; day?: number } | null; target?: { durationSec?: number; distanceKm?: number } | null } | null;
}

export function isRunSession(doc: RunSessionDoc | null | undefined): boolean {
  if (!doc) return false;
  return doneKindsOfDoc(doc).includes('run');
}

export interface CountRunOptions {
  /**
   * Run-done state (enable_home_v2): a plain run counts toward the week only from
   * RUN_COVERAGE.WEEK_COUNT_MIN_SEC (run-coverage.ts) — a test tap or a 1-minute run is real
   * activity but not a run of the plan. Default false = every saved run counts (flag-off parity).
   */
  applyMinimum?: boolean;
}

export function countRunSessions(
  docs: ReadonlyArray<RunSessionDoc | null | undefined> | null | undefined,
  opts: CountRunOptions = {},
): number {
  let n = 0;
  for (const d of docs ?? []) {
    if (!isRunSession(d)) continue;
    if (opts.applyMinimum && !runCountsTowardWeek(d)) continue;
    n += 1;
  }
  return n;
}
