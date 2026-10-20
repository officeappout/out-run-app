/**
 * Weekly RUN count (enable_home_v2, owner 20.10.2026): the weekly "ריצה" bar and the
 * after-workout "next run" logic count only runs — never walks. The weekly summary's
 * `categorySessions.cardio` lumps runs, walks and cycling together, so the runs come from
 * this week's workout docs instead. PURE.
 *
 * A run = workoutType / activityType 'running' (a run + strength hybrid with a running leg
 * counts too — the same rule as home's doneKindsOf). Weekly km stays combined (walk + run).
 */
export interface RunSessionDoc {
  workoutType?: string | null;
  activityType?: string | null;
}

export function isRunSession(doc: RunSessionDoc | null | undefined): boolean {
  if (!doc) return false;
  const type = doc.workoutType || doc.activityType || '';
  if (type === 'running') return true;
  return type === 'hybrid' && doc.activityType === 'running';
}

export function countRunSessions(docs: ReadonlyArray<RunSessionDoc | null | undefined> | null | undefined): number {
  let n = 0;
  for (const d of docs ?? []) if (isRunSession(d)) n += 1;
  return n;
}
