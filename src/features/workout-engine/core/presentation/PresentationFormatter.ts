/**
 * PresentationFormatter — Tier-3 UI Output Layer
 *
 * Owns every transform that converts the engine's deterministic exercise
 * list into a UI-ready payload:
 *
 *   1. formatRepRange       — pure formatter for the basic rep / hold range
 *                             string (Hebrew grammar aware).
 *   2. annotateRepRanges    — stamps `formattedRepRange` on every exercise so
 *                             React cards can read a pre-computed string
 *                             instead of reformatting on every render.
 *   3. sortAndPair          — locked sorting chain (antagonist re-pair →
 *                             domain priority sort).  This is the FINAL
 *                             ordering pass and nothing may reorder
 *                             `workout.exercises` after it.
 *   4. enforceVolumeCap     — final duration-cap pass (Phase A: remove
 *                             expendable exercises; Phase B: trim sets) so
 *                             the workout fits inside its bolt cap before
 *                             re-pairing and re-sorting.
 *
 * Special protocol awareness
 * ──────────────────────────
 *  • Pyramid steps  — when an exercise carries a `pyramidSequence`, the
 *    formatter still emits the parent's overall range string (the per-step
 *    target values are rendered by `PyramidStepCard`).  This prevents the
 *    parent card from showing a stale "12 חזרות" when steps are 12→10→8.
 *  • Antagonist pairs — `sortAndPair` runs after `enforceVolumeCap` so any
 *    pruning by the cap pass cannot leave a partner hanging without a
 *    counterpart in the final list (orphans are also cleared inside the
 *    cap pass via `clearOrphanedPairings`).
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type {
  GeneratedWorkout,
  WorkoutExercise,
} from '../../logic/workout-generator.types';
import {
  applyAntagonistPairing,
  applyDomainPrioritySort,
  clearOrphanedPairings,
} from '../../logic/workout-sorting.utils';
import { calculateEstimatedDuration } from '../../logic/workout-budgeting.utils';
import { classifyPyramidShape } from '../../logic/protocols/pyramid.processor';

// ============================================================================
// REP RANGE FORMATTER
// ============================================================================

/**
 * Hebrew unit labels — kept inline as constants so the formatter stays a pure
 * function with no i18n indirection (the engine is Hebrew-only by contract;
 * future English variants belong in a separate adapter, not here).
 */
const HE_UNIT_REPS_PLURAL  = 'חזרות';
const HE_UNIT_REPS_SINGULAR = 'חזרה אחת';
const HE_UNIT_SECONDS_PLURAL  = 'שניות';
const HE_UNIT_SECONDS_SINGULAR = 'שנייה אחת';

/**
 * Peak-Set neurological tag — appended to the formatted rep string when a
 * pyramid's terminal step is a single-rep (D3 peak overload).  Communicates
 * the maximal-effort intent so the user reads "1-2 חזרות (סט שיא)" instead
 * of a literal "חזרה אחת" that looks like an error in calisthenics cards.
 */
const HE_TAG_PEAK_SET = 'סט שיא';

// ============================================================================
// STATIC-SKILL HOLD CAP — Presentation safety net
// ============================================================================
//
// Defensive cap that mirrors `getIsometricTimeCap`'s Tier-2 ceiling at the
// presentation layer.  If any upstream path (legacy trio modifier, generic
// flow-tier hold, admin override) escapes a static-skill exercise into a
// rendered hold > 15 s, the formatter clamps both the displayed range and
// the underlying `reps` / `repsRange` so the UI never shows a 30 s planche.
//
// Intentionally duplicated rules (instead of importing `getIsometricTimeCap`)
// because:
//   1. We need ONLY the static-skill predicate, not the full 3-tier ladder
//      (we do NOT want to clamp handstands at the 45 s Tier-1 ceiling — they
//      are balance/endurance exercises, not strength levers).
//   2. Hebrew-name keyword detection is the canonical fallback for
//      mis-categorised Firestore docs (e.g. planche filed under
//      `horizontal_push`).  Same keyword set as the volume math helper to
//      keep both layers in agreement.

/** Hard ceiling for a static-skill hold at the presentation layer. */
const STATIC_SKILL_HOLD_CAP_SECONDS = 15;

/** Movement groups whose exercises are STATIC neurological skill levers. */
const STATIC_SKILL_MGS = new Set([
  'planche',
  'front_lever',
  'back_lever',
  'human_flag',
  'one_arm_pullup',
]);

/** Hebrew-name keywords that flag a static-skill exercise even when its
 *  Firestore movementGroup is the coarse parent (e.g. 'horizontal_push'). */
const STATIC_SKILL_NAME_KEYWORDS = [
  'פלאנץ',  // planche (matches 'פלאנץ׳ בטאק', 'פלאנץ׳ מלא', etc.)
  'פרונט',  // front lever
  'דגלון', // front/back lever (Hebrew variant)
  'דגל אנושי', // human flag
];

/**
 * True when `ex` is a STATIC neurological skill exercise (planche, front
 * lever, back lever, human flag, one-arm hold variants).
 *
 * Returns false for handstands and dead-hangs — those are balance / grip
 * endurance work and legitimately tolerate longer holds (per
 * `getIsometricTimeCap` Tier-1).  Also returns false for non-time-based
 * exercises (a planche push-up reps drill is not a hold).
 */
function isStaticSkillExercise(ex: WorkoutExercise): boolean {
  if (ex.isTimeBased !== true) return false;
  const mg = ex.exercise.movementGroup ?? '';
  if (STATIC_SKILL_MGS.has(mg)) return true;
  const nameAny = (ex.exercise.name as any);
  const nameHe: string =
    typeof nameAny === 'string' ? nameAny : (nameAny?.he ?? '');
  if (!nameHe) return false;
  return STATIC_SKILL_NAME_KEYWORDS.some(kw => nameHe.includes(kw));
}

/**
 * In-place enforcement of `STATIC_SKILL_HOLD_CAP_SECONDS` on a WorkoutExercise.
 *
 * Mutates `ex.reps` and `ex.repsRange` so downstream readers (active-workout
 * runner, share card, history logger) consume the corrected values.  Mirrors
 * the volume layer's Smart Range Compression: when the raw range exceeds the
 * cap, compress to a tight strength window {min: max(5, cap-5), max: cap}
 * (= {10, 15} for the canonical 15 s ceiling).
 *
 * Returns true when ANY clamping fired, false when the values were already
 * within the cap.  Callers can use this to log the rescue in `reasoning`.
 */
function clampStaticSkillHold(ex: WorkoutExercise): boolean {
  if (!isStaticSkillExercise(ex)) return false;
  const cap = STATIC_SKILL_HOLD_CAP_SECONDS;
  let mutated = false;

  if (ex.repsRange && ex.repsRange.max > cap) {
    const compressedMin = Math.max(5, cap - 5);
    ex.repsRange = {
      min: Math.min(ex.repsRange.min, compressedMin),
      max: cap,
    };
    mutated = true;
  } else if (ex.repsRange && ex.repsRange.min > cap) {
    // Edge case: max already ≤ cap but min slipped above (shouldn't happen
    // if min ≤ max, but defensive).  Pull min down to the compressed floor.
    ex.repsRange = {
      min: Math.max(5, cap - 5),
      max: ex.repsRange.max,
    };
    mutated = true;
  }

  if (ex.reps > cap) {
    ex.reps = cap;
    mutated = true;
  }

  if (mutated) {
    ex.reasoning.push(
      `presentation:static_skill_hold_cap(cap=${cap}s,mg=${ex.exercise.movementGroup ?? '?'})`,
    );
  }
  return mutated;
}

// ============================================================================
// PEAK-SET 1-REP DETECTION
// ============================================================================
//
// The D3 peak pyramid terminates in a single-rep neurological overload set.
// Rendered as a literal "חזרה אחת" it looks like a data error in calisthenics
// training cards (where rep ranges are the norm).  When the formatter sees:
//   • a non-time-based exercise
//   • carrying a `pyramidSequence` whose shape classifies as `peak`
//   • whose displayed value is the literal 1
// it expands the display to "1-2 חזרות (סט שיא)" — communicating both the
// effort window (1-2 reps depending on form quality on the day) and the
// neurological intent (maximal effort peak set).
//
// This is a STRICT visual-only override.  The underlying `reps` / per-step
// `targetReps` (= 1) is preserved so the runner still treats it as a 1-rep
// peak; only the rendered string is widened.

/**
 * True when `ex` is the parent of a D3 (peak-shape) pyramid that terminates
 * in a single-rep target.  Driven entirely off `pyramidSequence` so the
 * formatter does not need to know the session's `difficulty`.
 */
function isPeakPyramidWithSingleRepTerminal(ex: WorkoutExercise): boolean {
  const seq = ex.pyramidSequence;
  if (!Array.isArray(seq) || seq.length < 2) return false;
  if (classifyPyramidShape(seq) !== 'peak') return false;
  const last = seq[seq.length - 1];
  return last?.targetReps === 1;
}

/**
 * Build the basic rep / hold range string for a single exercise.
 *
 * Examples:
 *   Standard rep range  → "8-12 חזרות"
 *   Single rep value    → "12 חזרות"
 *   Single rep value (1) → "חזרה אחת"  (Hebrew singular grammar)
 *   Time-based range    → "15-30 שניות"
 *   Time-based single   → "30 שניות"
 *   Time-based single (1) → "שנייה אחת"
 *
 * Pyramid awareness:
 *   When `ex.pyramidSequence` is populated the per-step values vary by set
 *   (rendered by `PyramidStepCard`).  The parent's `formattedRepRange`
 *   shows the overall `repsRange` so the card title still summarises the
 *   movement without contradicting the per-step display.
 *
 * The returned string DOES NOT include:
 *   • setsPrefix   (e.g. "3×")              — added by active-workout cards
 *   • uniLabel     (e.g. " (לכל צד)")        — added by card components
 *   • goalSuffix   (e.g. " (יעד: 12)")        — runtime-conditional
 *
 * Card components compose these on top of the pre-computed `formattedRepRange`.
 */
export function formatRepRange(ex: WorkoutExercise): string {
  const isTimeBased = ex.isTimeBased === true;

  // ── Static-Skill Hold Safety Net ────────────────────────────────────────
  // Defensive presentation-layer clamp: if a static-skill exercise (planche /
  // front lever / back lever / human flag / one-arm holds) escaped upstream
  // capping with a hold > 15 s, clamp NOW so the rendered string can never
  // expose the user to a physiologically dangerous duration.  Mutates
  // `ex.reps` / `ex.repsRange` in place — see `clampStaticSkillHold` for
  // rationale.
  if (isTimeBased) clampStaticSkillHold(ex);

  // Resolve range bounds.  When repsRange is missing, synthesize a degenerate
  // range from the static reps value so we can route through one code path.
  const range = ex.repsRange;
  if (range && range.min !== range.max) {
    return `${range.min}-${range.max} ${
      isTimeBased ? HE_UNIT_SECONDS_PLURAL : HE_UNIT_REPS_PLURAL
    }`;
  }

  // ── Peak-Set 1-Rep Visual Window ────────────────────────────────────────
  // D3 peak pyramids terminate in a single-rep neurological overload set.
  // Rendered as the literal "חזרה אחת" it looks like a card error; we widen
  // it to "1-2 חזרות (סט שיא)" to communicate both the effort window and
  // the maximal-effort intent.  Only fires for non-time-based pyramid
  // parents whose terminal step is a 1-rep peak (see helper rules).
  const value = range?.min ?? ex.reps;
  if (!isTimeBased && value === 1 && isPeakPyramidWithSingleRepTerminal(ex)) {
    return `1-2 ${HE_UNIT_REPS_PLURAL} (${HE_TAG_PEAK_SET})`;
  }

  // Single value path — applies Hebrew singular grammar for n === 1
  // (`חזרה אחת` instead of `1 חזרות`).
  if (isTimeBased) {
    if (value === 1) return HE_UNIT_SECONDS_SINGULAR;
    return `${value} ${HE_UNIT_SECONDS_PLURAL}`;
  }
  if (value === 1) return HE_UNIT_REPS_SINGULAR;
  return `${value} ${HE_UNIT_REPS_PLURAL}`;
}

/**
 * Stamp `formattedRepRange` on every exercise in `exercises`.
 *
 * Mutates each entry in place (preserves object identity for stable React
 * keys / memoisation) and returns the same array reference for chaining.
 *
 * Idempotent — safe to re-run after later transforms that mutate
 * `reps`/`repsRange` (the next call simply overwrites the previous string).
 */
export function annotateRepRanges(
  exercises: WorkoutExercise[],
): WorkoutExercise[] {
  for (const ex of exercises) {
    ex.formattedRepRange = formatRepRange(ex);
  }
  return exercises;
}

// ============================================================================
// SORT-AND-PAIR — Locked Final Ordering Chain
// ============================================================================

export interface SortAndPairConfig {
  /**
   * True when the session resolves to a single primary domain (Pull-only,
   * Push-only, Legs-only).  Antagonist pairing must be SKIPPED for these
   * sessions — pairing logic falls back to coupling main exercises with
   * core/isolation entries which causes the renderer to lock low-tier
   * accessories adjacent to elite compounds.
   */
  isSingleDomain: boolean;
  /**
   * Firestore-driven preferred protocols for the current session.  When the
   * generator's probability roll skipped antagonist pairing internally but
   * the admin config explicitly requested it, sortAndPair re-applies the
   * pairing here so the admin intent always wins on the FINAL list.
   */
  adminPreferredProtocols?: string[];
  /**
   * Optional diagnostic label appended to the console log line — useful for
   * differentiating between trio options ('balanced' / 'intense' / 'easy').
   */
  diagnosticLabel?: string;
}

/**
 * Re-apply antagonist pairing (when applicable) and the final
 * domain-priority sort.  This is the LAST mutation allowed on
 * `workout.exercises` — anything that reorders the array after this
 * point will break the CNS / energy-management contract.
 *
 * The pairing decision mirrors the rule that lived inline in
 * `home-workout.service.ts` before Phase 4:
 *
 *   shouldPair = !isSingleDomain && (
 *                  workout.appliedProtocol === 'antagonist_pair' ||
 *                  adminPreferredProtocols.includes('antagonist_pair')
 *                )
 *
 * Returns the same `workout` reference (mutated) so call sites can keep
 * the existing assignment style.
 */
export function sortAndPair(
  workout: GeneratedWorkout,
  config: SortAndPairConfig,
): GeneratedWorkout {
  // ── Step 1: Re-apply antagonist pairing on the FINAL exercise list ───────
  const fromGenerator = workout.appliedProtocol === 'antagonist_pair';
  const fromAdminData =
    config.adminPreferredProtocols?.includes('antagonist_pair') ?? false;
  const shouldPair = !config.isSingleDomain && (fromGenerator || fromAdminData);

  if (shouldPair) {
    workout.appliedProtocol = 'antagonist_pair';
    workout.exercises = applyAntagonistPairing(workout.exercises);
    const pairedCount = workout.exercises.filter(e => e.pairedWith).length;
    console.log(
      `[PresentationFormatter] ✅ Re-applied antagonist pairing on final list ` +
      `(${pairedCount} exercises have pairedWith, ` +
      `source: ${fromGenerator ? 'generator' : 'adminData'}` +
      `${config.diagnosticLabel ? `, ${config.diagnosticLabel}` : ''})`,
    );
  }

  // ── Step 2: Final Strict Domain-Priority Sort (Step 5f-prime) ────────────
  // Runs AFTER:
  //   1. enforceVolumeCap has finished pruning exercises and trimming sets
  //   2. Antagonist pairing has been (re-)applied on the final list
  // Nothing else may reorder `workout.exercises` after this point.
  const beforeOrder = workout.exercises.map(e => e.exercise.id);
  workout.exercises = applyDomainPrioritySort(workout.exercises);
  const afterOrder = workout.exercises.map(e => e.exercise.id);
  const moved = beforeOrder.some((id, idx) => id !== afterOrder[idx]);
  console.log(
    `[PresentationFormatter] 🪜 Final domain-priority sort applied ` +
    `(${moved ? 'order changed' : 'order stable'}, ${workout.exercises.length} exercises` +
    `${config.diagnosticLabel ? `, ${config.diagnosticLabel}` : ''})`,
  );

  return workout;
}

// ============================================================================
// VOLUME CAP — Final Duration-Cap Enforcement
// ============================================================================

export interface VolumeCapConfig {
  /** Final session duration ceiling in minutes (Bolt cap). */
  durationCap: number;
  /** Floor for Phase B set trimming.  Defaults to 2. */
  minSets?: number;
  /** Hard ceiling on guard iterations to prevent infinite loops.  Defaults to 30. */
  maxIterations?: number;
  /**
   * Diagnostic label prefixed to console group / pipeline log lines, e.g.
   * 'Bolt2' or 'intense'.  Cosmetic only.
   */
  diagnosticLabel?: string;
}

/** Movement groups treated as core / anti-extension / anti-rotation isolation. */
const CORE_MGS = new Set(['core', 'anti_extension', 'anti_rotation']);
/** Lower-body movement groups counted by the "extra leg" expendability rule. */
const LEGS_MGS = new Set(['squat', 'hinge', 'lunge']);

/**
 * Enforce the bolt duration cap on the final exercise list.
 *
 * Algorithm (mirrors the pre-Phase-4 inline VolumeGuard):
 *
 *   Phase A — Remove the SINGLE most-expendable main exercise per iteration:
 *     1. Core / anti-extension / anti-rotation (most expendable)
 *     2. Isolation / accessory exercises
 *     3. Extra legs exercises beyond the first
 *   Re-estimates the duration after each removal; stops when within cap.
 *
 *   Phase B — Trim sets (down to `minSets`) by tier priority:
 *     flow / easy → match → skill → compound → foundation / hard / elite.
 *
 * Mutates `workout.exercises`, `workout.estimatedDuration`,
 * `workout.totalPlannedSets`.  Returns the same workout reference.
 *
 * Rest seconds are NEVER touched — the staircase is physiologically fixed.
 */
export function enforceVolumeCap(
  workout: GeneratedWorkout,
  config: VolumeCapConfig,
): GeneratedWorkout {
  const minSets = config.minSets ?? 2;
  const maxIterations = config.maxIterations ?? 30;
  const label = config.diagnosticLabel ?? 'volume_guard';

  let estimatedMin = calculateEstimatedDuration(workout.exercises);
  if (estimatedMin <= config.durationCap) {
    // Even when no pruning is needed, refresh the workout's estimate so the
    // cap pass is the single source of truth for the displayed duration.
    workout.estimatedDuration = estimatedMin;
    return workout;
  }

  let guardIterations = 0;
  console.group(
    `[PresentationFormatter.volumeCap] ${label} estimated=${estimatedMin}m > cap=${config.durationCap}m`,
  );

  // ── Phase A: remove whole exercises ─────────────────────────────────────
  // Each iteration removes the SINGLE most-expendable main exercise, then
  // re-estimates.  Stops as soon as we are within cap.
  const isExpendable = (ex: WorkoutExercise): boolean => {
    if (ex.exerciseRole !== 'main') return false;
    const mg = ex.exercise.movementGroup ?? '';
    if (CORE_MGS.has(mg)) return true;       // core removed first
    if (ex.priority === 'isolation' || ex.priority === 'accessory') return true;
    // Extra legs (not the sole legs exercise in the plan)
    const legsCount = workout.exercises.filter(
      e => e.exerciseRole === 'main' && LEGS_MGS.has(e.exercise.movementGroup ?? ''),
    ).length;
    if (LEGS_MGS.has(mg) && legsCount > 1) return true;
    return false;
  };

  while (estimatedMin > config.durationCap && guardIterations < maxIterations) {
    const removeCandidate = workout.exercises
      .filter(isExpendable)
      .sort((a, b) => a.score - b.score)[0]; // lowest-scored first

    if (!removeCandidate) break;

    workout.exercises = workout.exercises.filter(e => e !== removeCandidate);
    console.log(
      `[PresentationFormatter.volumeCap] PhaseA: removed ` +
      `"${(removeCandidate.exercise.name as any)?.he || removeCandidate.exercise.id}" ` +
      `(mg=${removeCandidate.exercise.movementGroup}, score=${removeCandidate.score})`,
    );
    // Orphan prevention — strictly clear any pairedWith reference that
    // pointed at the removed exercise so the runner never advances to a
    // partner that no longer exists.
    workout.exercises = clearOrphanedPairings(workout.exercises);
    estimatedMin = calculateEstimatedDuration(workout.exercises);
    guardIterations++;
  }

  // ── Phase B: trim sets on remaining exercises ───────────────────────────
  while (estimatedMin > config.durationCap && guardIterations < maxIterations) {
    const trimCandidate = workout.exercises
      .filter(ex => ex.exerciseRole === 'main' && ex.sets > minSets)
      .sort((a, b) => {
        const trimPriority = (ex: WorkoutExercise): number => {
          if (ex.tier === 'flow' || ex.tier === 'easy') return 0;
          if (ex.priority === 'isolation' || ex.priority === 'accessory') return 1;
          if (ex.tier === 'match') return 2;
          if (ex.priority === 'skill') return 3;
          if (ex.priority === 'compound') return 4;
          return 5; // foundation / hard / elite — trim last
        };
        return trimPriority(a) - trimPriority(b);
      })[0];

    if (!trimCandidate) break;

    trimCandidate.sets -= 1;
    trimCandidate.reasoning.push(
      `volume_guard:sets_trimmed(${label}cap=${config.durationCap}m)`,
    );
    estimatedMin = calculateEstimatedDuration(workout.exercises);
    guardIterations++;
  }

  workout.estimatedDuration = estimatedMin;
  workout.totalPlannedSets = workout.exercises.reduce((s, ex) => s + ex.sets, 0);
  console.log(
    `[PresentationFormatter.volumeCap] Done after ${guardIterations} step(s): ` +
    `${estimatedMin}m, ${workout.totalPlannedSets} sets, ` +
    `${workout.exercises.filter(e => e.exerciseRole === 'main').length} main exercises`,
  );
  console.groupEnd();

  return workout;
}
