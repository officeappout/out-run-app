/**
 * Run-done state — the best-effort writes home makes once today's run is judged
 * (enable_home_v2 + enable_run_done_state_v1). Firestore glue only; every decision is pure
 * (run-coverage.ts, pace-self-correction.service.ts). Never throws.
 *
 *  1. completeRunEntry: the schedule entry completed + running.lastWorkoutDate (one transaction,
 *     planned-run-complete.ts) for a 'done' / 'covered' run.
 *  2. stampCoverageTarget: a FREE run doc gets the plan target it was matched to
 *     (runMeta.coverageTarget), so the week's run count applies the same 50% test.
 *  3. feedFreeRunPace: a covered FREE run with a guarded pace sample may make the pace targets
 *     faster — never slower (applyFreeRunPositive).
 */
import type { PlannedRunDoneResult, PlannedRunTarget, RunCoverageDoc } from '@/lib/run-coverage';

export function runDateIso(doc: { date?: unknown } | null | undefined): string {
  const v = doc?.date as { toDate?: () => Date } | Date | string | number | undefined;
  const d = v instanceof Date ? v
    : typeof v === 'string' || typeof v === 'number' ? new Date(v)
    : v && typeof v.toDate === 'function' ? v.toDate()
    : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

export async function completeRunEntry(
  uid: string,
  entry: { week: number; day: number },
  done: PlannedRunDoneResult,
  doc: (RunCoverageDoc & { date?: unknown }) | undefined,
): Promise<void> {
  try {
    const { completePlannedRunEntry } = await import('@/features/workout-engine/core/services/planned-run-complete');
    await completePlannedRunEntry(uid, {
      week: entry.week,
      day: entry.day,
      workoutId: done.workoutId ?? null,
      coverage: done.coverage ?? 'free',
      runDate: runDateIso(doc),
    });
  } catch (e) {
    console.warn('[runDone] entry write skipped:', e);
  }
}

export async function stampCoverageTarget(workoutId: string, target: PlannedRunTarget): Promise<void> {
  try {
    const [{ doc, updateDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
    const clean: PlannedRunTarget = {};
    if (target.durationSec && target.durationSec > 0) clean.durationSec = target.durationSec;
    if (target.distanceKm && target.distanceKm > 0) clean.distanceKm = target.distanceKm;
    if (!clean.durationSec && !clean.distanceKm) return;
    await updateDoc(doc(db, 'workouts', workoutId), { 'runMeta.coverageTarget': clean });
  } catch (e) {
    console.warn('[runDone] coverage target stamp skipped:', e);
  }
}

export async function feedFreeRunPace(uid: string, workoutId: string, secPerKm: number): Promise<void> {
  try {
    const [{ summarizeFreeRun, normalizePaceProfile }, { writeFreeRunToPaceProfile }, { useRunningConfigStore }, { useUserStore }, { db }] =
      await Promise.all([
        import('@/features/workout-engine/core/services/pace-self-correction.service'),
        import('@/features/workout-engine/core/services/pace-profile-write.service'),
        import('@/features/workout-engine/core/store/useRunningConfigStore'),
        import('@/features/user/identity/store/useUserStore'),
        import('@/lib/firebase'),
      ]);
    const local = normalizePaceProfile(useUserStore.getState().profile?.running?.paceProfile);
    if (!local) return;
    const config = useRunningConfigStore.getState().config;
    const summary = summarizeFreeRun(secPerKm, local, config);
    if (!summary.ok) return;
    const res = await writeFreeRunToPaceProfile(db, uid, workoutId, summary, config);
    if (!res.written) return;
    const user = useUserStore.getState();
    const running = user.profile?.running;
    if (running) user.updateProfile({ running: { ...running, paceProfile: res.paceProfile } });
  } catch (e) {
    console.warn('[runDone] free-run pace skipped:', e);
  }
}
