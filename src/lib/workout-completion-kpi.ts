/**
 * Workout-completion KPI predicate — the locked activation/retention
 * definition (docs/product/kpi-definitions.md), applied to a single raw
 * `workouts/{id}` document.
 *
 * Pulled into its own neutral, SDK-agnostic file (plain `Record<string,
 * unknown>` in, `boolean` out — no `firebase/firestore` or `firebase-admin`
 * import) specifically so it can be shared between a CLIENT-SDK consumer
 * (funnel-analytics.service.ts, `doc.data()` from the `firebase/firestore`
 * web SDK) and a SERVER-SDK consumer (growth-metrics/route.ts, `doc.data()`
 * from `firebase-admin`'s Firestore) without importing either SDK here.
 * Both SDKs' `doc.data()` return the same plain-object shape; only the
 * surrounding query API differs.
 *
 * Journey Hub bug-fix round (06.10.2026, BUG 1): the funnel's activation/
 * retention stages previously keyed on `progression.workoutCount`, a
 * client-written best-effort counter (`completion-sync.service.ts:137-146`,
 * wrapped in a try/catch that silently swallows write failures) — already
 * identified as unreliable and replaced with a real per-user count from the
 * `workouts` collection itself in `users.service.ts:162-167` / `admin/
 * users/all/page.tsx:211-217`. This predicate is the KPI-aware version of
 * that same "read real workouts, not the counter" fix, reused by both the
 * funnel and growth-metrics' activation-by-source / time-to-first-workout
 * computations so the SAME tab can't show two different answers for
 * "activated" depending on which card you're looking at.
 */

/**
 * True if `data` (a raw `workouts/{id}` document) counts toward the
 * activation/retention KPI:
 *   - walk / run / cycling / hybrid: any completed workout doc counts.
 *   - strength ('strength' or its legacy alias 'workout'): requires
 *     `setsCompleted >= 1` — computed at save time directly from the real
 *     exercise log (`useProgressionSync.ts:181`, `hybrid-save.service.ts:65`),
 *     not a separately-incremented counter, so it carries the same
 *     reliability as the doc's existence itself.
 *   - recovery: excluded — not a "real" training session per the locked
 *     definition (walk/run/strength/cardio only).
 *
 * KNOWN GAP, deliberately not solved here (confirmed via trace of
 * useWorkoutStateMachine.ts, approved by David 06.10.2026): the locked
 * definition says strength should count only "≥1 real set BEYOND
 * WARMUP." Warmup/cooldown exercises DO reach the live exercise log
 * (both the explicit follow-along branch, lines ~786-806, and the
 * reps/time branch, which applies no role check at all) — but the
 * PERSISTED shape (`SegmentExerciseDetail`) carries no role/warmup
 * field, and `setsCompleted` is computed from that same unfiltered log.
 * So `setsCompleted >= 1` is the best available approximation today: a
 * workout whose only confirmed sets were warmup follow-along entries
 * would currently still qualify. Closing this gap needs new
 * instrumentation (a role field on the live log + persisted doc) — a
 * separate, future task per docs/product/kpi-definitions.md, not
 * assumed fixed here.
 */
export function isRealWorkoutCompletion(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const workoutType = typeof data.workoutType === 'string' ? data.workoutType : data.activityType;
  if (workoutType === 'recovery') return false;
  if (workoutType === 'strength' || workoutType === 'workout') {
    return typeof data.setsCompleted === 'number' && data.setsCompleted >= 1;
  }
  // running / walking / cycling / hybrid / anything else real-looking —
  // the doc existing at all means saveWorkout() was reached, which only
  // happens on an actual completion (see storage.service.ts's call sites).
  return true;
}
