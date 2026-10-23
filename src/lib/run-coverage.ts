/**
 * run-coverage — when does a saved run count? ONE pure module, ONE set of tunable constants,
 * shared by the run player's save path (discard rule + planned target), the home run slot
 * (resolveHomeRunSlot's doneState) and the week counters (countRunSessions), so the activity
 * strip, the week bars and the "הריצה של היום" card can never disagree (enable_home_v2,
 * owner 23.10.2026, docs: agent-briefs/home-after-run-audit.md).
 *
 * Rules (owner):
 *  - A PLANNED run (runMeta.plan = today's entry) reaching >= 70% of its target (time or km)
 *    is 'done': the schedule entry is complete.
 *  - Any other run (a free run, or a planned one that stopped short) that is >= 10 min AND
 *    >= 50% of the planned time or km 'covers' the slot ('covered'): shown as done.
 *  - Anything shorter is 'partial': a real activity (it stays in the strip) but it counts
 *    toward neither the plan nor the week's run goal. No "missed" wording anywhere.
 *  - Beginner plans (0→5 km and similar, isBeginnerRunPlan): a shorter run never covers the
 *    slot — only the planned run itself completes it (the card says "good start" instead).
 *  - The week's run goal uses the same test: a run counts when it is done / covers its matched
 *    plan target; with no known target, from 10 minutes.
 *  - Under 60 s AND under 100 m is not saved at all (the existing discard rule, unchanged).
 *
 * No React, no Firebase, no feature imports.
 */

export const RUN_COVERAGE = {
  /** A planned run is "done" at this share of its target (time or km). */
  PLANNED_DONE_RATIO: 0.7,
  /** A free / shorter run covers the slot only from this many seconds... */
  COVER_MIN_SEC: 600,
  /** ...AND this share of the planned time or km. */
  COVER_RATIO: 0.5,
  /** The planned target is unknown (not loaded yet / an old doc): a run this long counts. */
  UNKNOWN_TARGET_MIN_SEC: 1200,
  /** A plain run counts toward the week's run goal from this many seconds. */
  WEEK_COUNT_MIN_SEC: 600,
  /** The save-time discard rule: under BOTH of these the run is a test tap, not saved. */
  DISCARD_MAX_SEC: 60,
  DISCARD_MAX_KM: 0.1,
} as const;

export type RunDoneState = 'done' | 'covered' | 'partial' | 'none';

/** What the plan asked for. Either field may be missing; both missing = unknown. */
export interface PlannedRunTarget {
  durationSec?: number;
  distanceKm?: number;
}

/** The fields of a saved workout doc this module reads (WorkoutHistoryEntry subset). */
export interface RunCoverageDoc {
  id?: string;
  workoutType?: string | null;
  activityType?: string | null;
  /** seconds */
  duration?: number;
  /** km */
  distance?: number;
  runMeta?: {
    plan?: { week?: number; day?: number } | null;
    /** Written by the player for planned runs (enable_home_v2): what the plan asked for. */
    target?: PlannedRunTarget | null;
    /**
     * A FREE run judged against today's planned run (enable_run_done_state_v1): the plan target
     * it was matched to, stamped from home when coverage is computed. The week counter uses it.
     */
    coverageTarget?: PlannedRunTarget | null;
    /** Free runs: the player's guarded pace sample (pace self-correction, positive-only). */
    freePace?: { secPerKm?: number } | null;
  } | null;
}

const pos = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Save-time discard rule (kept byte-for-byte: duration < 60 s AND distance < 0.1 km). */
export function isDiscardableRun(durationSec: number, distanceKm: number): boolean {
  return durationSec < RUN_COVERAGE.DISCARD_MAX_SEC && distanceKm < RUN_COVERAGE.DISCARD_MAX_KM;
}

/** A plain (solo) run doc: not a combined / hybrid workout, not a walk or a ride. */
export function isPlainRunDoc(doc: RunCoverageDoc | null | undefined): boolean {
  if (!doc) return false;
  const t = doc.workoutType || doc.activityType || '';
  return t === 'running';
}

/** The planned target of a materialized workout's blocks (time and, when blocks carry it, km). */
export function plannedTargetOfBlocks(
  blocks: ReadonlyArray<{ durationSeconds?: number; distanceMeters?: number }> | null | undefined,
): PlannedRunTarget | null {
  if (!blocks?.length) return null;
  let sec = 0;
  let m = 0;
  for (const b of blocks) {
    sec += pos(b.durationSeconds);
    m += pos(b.distanceMeters);
  }
  const out: PlannedRunTarget = {};
  if (sec > 0) out.durationSec = Math.round(sec);
  if (m > 0) out.distanceKm = Math.round(m) / 1000;
  return out.durationSec || out.distanceKm ? out : null;
}

const hasTarget = (t: PlannedRunTarget | null | undefined): t is PlannedRunTarget =>
  !!t && (pos(t.durationSec) > 0 || pos(t.distanceKm) > 0);

/** The larger of the run's share of the planned time and of the planned km (0 when unknown). */
export function runShareOfTarget(doc: RunCoverageDoc, target: PlannedRunTarget): number {
  const byTime = pos(target.durationSec) > 0 ? pos(doc.duration) / pos(target.durationSec) : 0;
  const byKm = pos(target.distanceKm) > 0 ? pos(doc.distance) / pos(target.distanceKm) : 0;
  return Math.max(byTime, byKm);
}

/**
 * The state ONE run doc gives today's run slot. `planned` = the doc is the run started from
 * this very entry (runMeta.plan matches). Never 'none' for a run doc.
 */
export function classifyRunDoc(
  doc: RunCoverageDoc,
  target: PlannedRunTarget | null | undefined,
  planned: boolean,
  /** Beginner plan: nothing but the planned run itself completes the slot (never 'covered'). */
  beginner = false,
): Exclude<RunDoneState, 'none'> {
  const sec = pos(doc.duration);
  if (!hasTarget(target)) {
    if (sec < RUN_COVERAGE.UNKNOWN_TARGET_MIN_SEC) return 'partial';
    return planned ? 'done' : beginner ? 'partial' : 'covered';
  }
  const share = runShareOfTarget(doc, target);
  if (planned && share >= RUN_COVERAGE.PLANNED_DONE_RATIO) return 'done';
  if (!beginner && sec >= RUN_COVERAGE.COVER_MIN_SEC && share >= RUN_COVERAGE.COVER_RATIO) return 'covered';
  return 'partial';
}

const RANK: Record<RunDoneState, number> = { none: 0, partial: 1, covered: 2, done: 3 };

export interface PlannedRunDoneResult {
  state: RunDoneState;
  /** The doc that gave 'done' / 'covered' (for coveredBy and the done row). */
  workoutId?: string;
  /** 'plan' = the planned run itself reached its target; 'free' = a free / shorter run covered the slot. */
  coverage?: 'plan' | 'free';
}

/**
 * Today's run slot, judged against today's saved docs: the best state over every plain run.
 * `entryTarget` = what today's entry planned (used when a doc carries no target of its own;
 * a planned doc's own runMeta.target wins — it is exactly what was shown at start).
 */
export function plannedRunDoneToday(
  entry: { week: number; day: number } | null | undefined,
  todaysWorkouts: ReadonlyArray<RunCoverageDoc | null | undefined> | null | undefined,
  entryTarget?: PlannedRunTarget | null,
  opts: { beginner?: boolean } = {},
): PlannedRunDoneResult {
  if (!entry) return { state: 'none' };
  let best: PlannedRunDoneResult = { state: 'none' };
  for (const doc of todaysWorkouts ?? []) {
    if (!doc || !isPlainRunDoc(doc)) continue;
    const plan = doc.runMeta?.plan;
    const planned = !!plan && plan.week === entry.week && plan.day === entry.day;
    const target = (planned ? doc.runMeta?.target : doc.runMeta?.coverageTarget) ?? entryTarget;
    const state = classifyRunDoc(doc, target, planned, !!opts.beginner);
    if (RANK[state] > RANK[best.state]) {
      best = state === 'partial'
        ? { state }
        : { state, workoutId: doc.id, coverage: state === 'done' ? 'plan' : 'free' };
    }
  }
  return best;
}

/**
 * Does this doc count toward the week's run goal? The same test as the slot: a planned run that
 * reached its own target, or a run of >= 10 min AND >= 50% of its matched plan target
 * (runMeta.target / runMeta.coverageTarget); with no known target, a plain run counts from
 * WEEK_COUNT_MIN_SEC. Every other doc (combined workouts, whose running legs are judged by
 * hybrid-counting) is unchanged. Only called while enable_home_v2 is on.
 */
export function runCountsTowardWeek(doc: RunCoverageDoc | null | undefined): boolean {
  if (!doc) return false;
  if (!isPlainRunDoc(doc)) return true;
  const own = doc.runMeta?.target;
  const planned = !!doc.runMeta?.plan;
  if (planned && hasTarget(own) && classifyRunDoc(doc, own, true) === 'done') return true;
  const matched = (planned ? own : null) ?? doc.runMeta?.coverageTarget;
  if (hasTarget(matched)) {
    return pos(doc.duration) >= RUN_COVERAGE.COVER_MIN_SEC && runShareOfTarget(doc, matched) >= RUN_COVERAGE.COVER_RATIO;
  }
  return pos(doc.duration) >= RUN_COVERAGE.WEEK_COUNT_MIN_SEC;
}
