/**
 * Soft-adaptation — Phase 0 ("data only, no behaviour change"), 18.10.2026.
 *
 * Shared vocabulary for the signals Phase 0 starts recording:
 *   • exercise_swaps/{auto} — one doc per exercise swap (who / what → what /
 *     why / where in the session). Product data (it is what adaptation will
 *     learn from), so NOT gated on analytics consent. Written fire-and-forget;
 *     a failed write never blocks the swap itself.
 *   • per-set honesty on the saved strength log (repsSource / coachHints),
 *     plus the plan context each exercise was prescribed under.
 *   • workouts/{id}.feedback — the optional post-workout "קל מדי / בדיוק /
 *     קשה מדי" rating (POST_WORKOUT_SURVEY_V1).
 *
 * NOTHING in Phase 0 reads these back to change a level, a target or a plan.
 *
 * ⚠️ 'pain' is recorded so an admin can see it, but it must NEVER feed
 * adaptation (a later phase must filter `reason === 'pain'` out of any
 * difficulty signal). The app has no user-facing injury-shield editor to
 * route to today (health.injuries is set at onboarding only), so a 'pain'
 * swap is logged and the modal shows a short safety line — nothing else.
 */

/** Why the user swapped — one optional tap in the replacement modal. */
export const SWAP_REASONS = ['too_hard', 'too_easy', 'no_equipment', 'dislike', 'pain'] as const;
export type SwapReason = (typeof SWAP_REASONS)[number];

/** Level of the replacement relative to the swapped-away exercise (modal's levelComparison). */
export const SWAP_DIRECTIONS = ['lower', 'same', 'higher'] as const;
export type SwapDirection = (typeof SWAP_DIRECTIONS)[number];

/** ExerciseReplacementModal tab the replacement came from. */
export const SWAP_TABS = ['adaptation', 'alternative'] as const;
export type SwapTab = (typeof SWAP_TABS)[number];

/** Which UI entry point produced the swap. */
export const SWAP_SOURCES = [
  'preview', // workout preview drawer, a single exercise
  'preview_pyramid_step', // preview drawer, one step of a mechanical pyramid
  'swap_all_location', // preview drawer bulk location swap (system — userInitiated:false)
  'in_workout_active', // player, the active-exercise swap button
  'in_workout_log_drawer', // player, the reps log drawer's "החלפת תרגיל"
  'in_workout_coach_hint', // player, the "קשה מדי?" coach hint's "החלפה"
  'in_workout_find_equipment', // player, guided find-the-equipment overlay
  'hybrid_overview', // map hybrid overview sheet, before the run
] as const;
export type SwapSource = (typeof SWAP_SOURCES)[number];

/** Which session surface the swap happened in. */
export const SWAP_FLOWS = ['preview', 'solo', 'hybrid'] as const;
export type SwapFlow = (typeof SWAP_FLOWS)[number];

/**
 * Field whitelist of an exercise_swaps doc. firestore.rules' create rule
 * mirrors this list exactly (keys().hasOnly) — a pure test
 * (__tests__/exercise-swap-rules-whitelist.test.ts) fails if they drift.
 */
export const EXERCISE_SWAP_FIELDS = [
  'userId',
  'at',
  'sessionClientId',
  'fromExerciseId',
  'fromName',
  'toExerciseId',
  'toName',
  'domain',
  'fromLevel',
  'toLevel',
  'userDomainLevel',
  'direction',
  'tab',
  'source',
  'flow',
  'userInitiated',
  'location',
  'parkId',
  'segmentRole',
  'setsDoneBefore',
  'lastSetReps',
  'rangeMin',
  'reason',
  'appVersion',
] as const;
export type ExerciseSwapField = (typeof EXERCISE_SWAP_FIELDS)[number];

/** Per-set provenance of a logged rep/second value. */
export type RepsSource =
  /** the user moved the picker / typed a value */
  | 'edited'
  /** saved without touching the picker — the prefilled target/default */
  | 'default'
  /** measured by the in-player timer (time exercises), untouched */
  | 'timer';

/** Per-set coach-hint state at save time ('none' = no hint fired). */
export type CoachHintMark = 'fail' | 'overachieve' | 'none';

/** Extra context the modal hands back with a replacement (4th onReplace arg). */
export interface ReplacementMeta {
  tab: SwapTab;
  /** Optional one-tap reason chip; undefined when the user skipped it. */
  reason?: SwapReason;
  /** Resolved level of the chosen replacement (modal's resolvedLevel). */
  toLevel?: number;
  /** The level the modal compared against (its currentLevel prop). */
  fromLevel?: number;
}

/** Context the player hands to its parent when the user opens the swap modal. */
export interface SwapOpenContext {
  source: SwapSource;
  /** Sets of the swapped exercise already logged in this session. */
  setsDoneBefore?: number;
  /** Reps/seconds of the last logged set of the swapped exercise. */
  lastSetReps?: number;
  /** Prescribed range minimum of the swapped exercise. */
  rangeMin?: number;
}

/** workouts/{id}.feedback — the post-workout survey answer. */
export type WorkoutFeedbackRating = 'too_easy' | 'just_right' | 'too_hard';
export interface WorkoutFeedbackRecord {
  /** null = the survey was shown and skipped. */
  rating: WorkoutFeedbackRating | null;
  at: Date;
  /** true = shown by the cadence gate (always true today — no voluntary entry point yet). */
  prompted: boolean;
}
