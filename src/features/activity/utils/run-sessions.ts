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

export interface RunSessionDoc {
  workoutType?: string | null;
  activityType?: string | null;
  /** Combined workouts: the per-leg records (aerobicType decides run vs walk). */
  segments?: unknown;
}

export function isRunSession(doc: RunSessionDoc | null | undefined): boolean {
  if (!doc) return false;
  return doneKindsOfDoc(doc).includes('run');
}

export function countRunSessions(docs: ReadonlyArray<RunSessionDoc | null | undefined> | null | undefined): number {
  let n = 0;
  for (const d of docs ?? []) if (isRunSession(d)) n += 1;
  return n;
}
