/**
 * core-block — the core/abs slot as a 3-form repertoire (docs/workout-engine/
 * 09-CORE-TABATA.md, David's decisions 04.09.2026).
 *
 * Three forms, chosen once per exercise (never mixed within one slot):
 *   'single'      — one core exercise × 2-3 sets. The pre-existing shape;
 *                    this module does nothing for it — BudgetDistributor's
 *                    CORE_FIXED_SETS range (2-3, opened from exactly-2) and
 *                    the normal per-domain slot pick already produce it.
 *   'tabata'      — a 4-minute tabata block (TABATA_CLASSIC, UNCHANGED —
 *                    David: "לא נפתח ולא משתנה") with 2, 4, or 8 core
 *                    exercises. Member count changes how many of the 8
 *                    intervals each exercise gets (2×4 rounds, 4×2 rounds,
 *                    8×1 round) — never the block's own length. Reuses
 *                    buildTabataBlock's existing pool-injection path
 *                    unchanged, just with a core-only, injury-filtered pool
 *                    and an explicit member-count target.
 *   'follow_along' — one of the 4 "טבטה" ladder items (core L4/L8/L12/L16,
 *                    exerciseRole:'reinforcement') fills the slot alone.
 *
 * All three must pass the SAME core-slot gate as always
 * (hasExplicitCoreLevel, workout-selection.utils.ts:575-608) — this module
 * only runs on an exercise that already passed it.
 */
import type { Exercise, InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, DifficultyLevel } from '../workout-generator.types';
import { buildTabataBlock } from './tabata.block';
import { TABATA_CORE_MEMBER_COUNTS } from './tabata.constants';
import { hasExplicitCoreLevel } from '../workout-selection.utils';
import { resolveExerciseLevelForDomains } from '../workout-selection.utils';

export type CoreBlockForm = 'single' | 'tabata' | 'follow_along';

// ============================================================================
// FORM-SELECTION STRATEGY — one flag, one place (David's explicit requirement)
// ============================================================================

/**
 * The 4 mechanisms proposed in docs/workout-engine/09-CORE-TABATA.md §2,
 * kept here (not just in the doc) so the tradeoff is visible at the point
 * that actually matters — beside the switch that implements one of them:
 *
 *   'remaining_time'  — IMPLEMENTED (default). Pick among the forms that fit
 *                        the session's remaining time headroom. Simplest:
 *                        needs no new state beyond what's already computed
 *                        per generation call (availableTime, estimated
 *                        duration so far). Risk (09-CORE-TABATA.md §2a):
 *                        compounds the pre-existing accidental duration
 *                        correlation in core's overall presence — mitigated
 *                        by the Full-Body Guarantee (which now runs
 *                        regardless of remaining time) but not eliminated
 *                        for the non-guaranteed cases.
 *   'by_bolt'          — NOT implemented. Bolt 1 can't fire tabata at all
 *                        (existing gate) so this collapses to "Easy → single,
 *                        Balanced/Intense → tabata/follow_along" — reuses an
 *                        axis (difficulty) that already drives several other
 *                        core-specific decisions (MAX_CORE=1 in Intense,
 *                        08-CORE.md §2), so a 3rd decision riding the same
 *                        lever risks over-coupling intensity and form
 *                        variety into one signal instead of two.
 *   'weighted_random'  — NOT implemented. Truest reading of "variety is the
 *                        point," but needs persisted last-N-forms state this
 *                        pass doesn't build (see ANTI-REPETITION SCOPE below)
 *                        — the biggest net-new surface of the four.
 *   'goal_history'     — NOT implemented. Most goal-aware (ties into
 *                        08-CORE.md's open "core goal" question), but the
 *                        hardest to debug when a user reports repetition,
 *                        since correctness depends on a history read this
 *                        pass doesn't have a verified source for.
 *
 * To switch strategies: change this one constant. Every call site reads it
 * through chooseCoreForm() below — nothing else needs to change.
 */
export type CoreFormStrategy = 'remaining_time' | 'by_bolt' | 'weighted_random' | 'goal_history';
export const CORE_FORM_STRATEGY: CoreFormStrategy = 'remaining_time';

// ============================================================================
// ANTI-REPETITION — SCOPE NOTE (read before extending)
// ============================================================================
//
// Hard requirement: never the same form 3 times in a row. This pass tracks
// repetition WITHIN one generateHomeWorkoutTrio call (across its 3 bolts),
// in memory — zero new Firestore reads/writes. This is a deliberate,
// documented scoping decision, not the full cross-session guarantee "3
// times in a row" most naturally suggests (3 consecutive days/sessions the
// user actually does).
//
// Why scoped this way: the codebase's one real precedent for "avoid
// repeating recent content" (recentExerciseIds / getRecentExerciseIds,
// useWeeklyVolumeStore.ts:396) is a CLIENT-SIDE store read at the call site
// (StatsOverview.tsx:844), not something resolved inside the pure generator
// or home-workout.service.ts. Wiring true cross-session tracking correctly
// means either extending that store (UI-layer surface, not verified this
// pass) or adding a new Firestore read — both real, separate pieces of work
// this pass didn't have room to trace and verify to the same standard as
// the rest of this feature.
//
// The extension point is real, not decorative: `recentCoreForms` below
// accepts real history the moment a caller supplies it (see
// WorkoutGenerationContext.recentCoreForms) — chooseCoreForm() folds it into
// the SAME anti-repetition check as the in-trio forms, so wiring a real
// history source later requires zero changes here.
export interface CoreFormChoiceInput {
  /** Forms already chosen earlier in THIS SAME trio call, oldest first. */
  formsChosenThisTrio: CoreBlockForm[];
  /** Real cross-session history, when a caller provides it (see scope note above). Oldest first. */
  recentCoreForms?: CoreBlockForm[];
  availableTime: number;
  /** Minutes already committed by the rest of the workout (mains + warmup/cooldown estimate so far). */
  estimatedDurationSoFar: number;
  difficulty: DifficultyLevel;
}

/** Minutes of headroom needed for each form, beyond the rest of the session. */
const FORM_TIME_COST_MINUTES: Record<CoreBlockForm, number> = {
  single: 3,   // one exercise, 2-3 sets — folded into the normal main-slot cost already
  tabata: 4,   // TABATA_BLOCK_SECONDS / 60, fixed regardless of member count
  follow_along: 4, // matches the tabata block's 4-minute cost — same video length (§1.6)
};

function eligibleForms(input: CoreFormChoiceInput): CoreBlockForm[] {
  const headroom = input.availableTime - input.estimatedDurationSoFar;
  const forms: CoreBlockForm[] = (['single', 'tabata', 'follow_along'] as CoreBlockForm[])
    .filter((f) => headroom >= FORM_TIME_COST_MINUTES[f]);
  // 'single' is always the floor — if literally nothing else fits, still offer it
  // (matches the pre-existing behavior: a core exercise was always just one pick).
  return forms.length > 0 ? forms : ['single'];
}

/** True if picking `form` next would make 3-in-a-row across [...history, ...formsChosenThisTrio, form]. */
function wouldRepeatThreeTimes(form: CoreBlockForm, input: CoreFormChoiceInput): boolean {
  const sequence = [...(input.recentCoreForms ?? []), ...input.formsChosenThisTrio, form];
  const lastThree = sequence.slice(-3);
  return lastThree.length === 3 && lastThree.every((f) => f === form);
}

/**
 * Choose this exercise's core-block form. Pure — no randomness beyond
 * Math.random() for the weighted pick among eligible, non-repetition-
 * violating forms (same style as the rest of the generator's own
 * probability rolls, e.g. assignVolume's reps range).
 */
export function chooseCoreForm(input: CoreFormChoiceInput): CoreBlockForm {
  if (CORE_FORM_STRATEGY !== 'remaining_time') {
    // Only 'remaining_time' is implemented this pass (see the strategy
    // doc-comment above) — fall back to it rather than silently no-op if
    // the constant is ever flipped to an unimplemented value.
    console.warn(
      `[CoreBlock] CORE_FORM_STRATEGY='${CORE_FORM_STRATEGY}' is not implemented — ` +
      `falling back to 'remaining_time'.`,
    );
  }

  const eligible = eligibleForms(input);
  const allowed = eligible.filter((f) => !wouldRepeatThreeTimes(f, input));
  // If every eligible form would violate anti-repetition (only possible when
  // eligible.length === 1 and that one form is already 2-in-a-row), the
  // anti-repetition rule cannot be satisfied without changing eligibility —
  // fall back to the eligible set rather than crash; 09-CORE-TABATA.md flags
  // this as a real edge case (a duration-starved session with a long recent
  // streak), not silently ignored.
  const pool = allowed.length > 0 ? allowed : eligible;

  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================================
// FORM C — follow-along resolution
// ============================================================================

/**
 * Pick the follow-along "טבטה" ladder item matching the user's core level —
 * nearest-at-or-below, same bias as poolLevelOf/tabata's own level matching
 * (level-less defaults IN elsewhere in this file family; not applicable here
 * since all 4 ladder items carry a real targetPrograms level).
 *
 * `pool` is expected to be pre-filtered to exerciseRole==='reinforcement'
 * (see WorkoutGenerator.ts's Step 6c) — this function does not re-filter by
 * role so it stays reusable if the reinforcement pool grows beyond the
 * current 4-item core ladder.
 */
export function resolveFollowAlongCoreExercise(
  pool: Exercise[],
  userCoreLevel: number,
  activeProgramId?: string,
): Exercise | undefined {
  const coreReinforcement = pool.filter((ex) => hasExplicitCoreLevel(ex));
  if (coreReinforcement.length === 0) return undefined;

  const withLevel = coreReinforcement.map((ex) => ({
    ex,
    level: resolveExerciseLevelForDomains(ex, ['core'], activeProgramId).level,
  }));

  const atOrBelow = withLevel.filter((c) => c.level <= userCoreLevel);
  const candidates = atOrBelow.length > 0 ? atOrBelow : withLevel; // none at/below → easiest available
  // Nearest level: highest among at-or-below, or lowest overall as the fallback.
  candidates.sort((a, b) =>
    atOrBelow.length > 0 ? b.level - a.level : a.level - b.level,
  );
  return candidates[0].ex;
}

// ============================================================================
// FORM B — core-only tabata block, reusing buildTabataBlock unchanged
// ============================================================================

export interface CoreTabataBlockInput {
  memberCount: 2 | 4 | 8;
  corePool: Exercise[]; // hiit_friendly, core-matching
  userLevel: number;
  location?: string;
  availableEquipment?: string[];
  injuryShield?: InjuryShieldArea[];
}

/**
 * Build the form-B block by calling buildTabataBlock's existing pool-
 * injection path with a core-only pool and an explicit member-count target
 * — zero new tabata logic (David: "השתמש בתשתית הקיימת... אל תבנה חדשה").
 * Mutates `target` in place (buildTabataBlock's own contract) by pushing
 * the chosen members onto it; callers are responsible for having already
 * removed the single form-A core exercise this block replaces.
 */
export function buildCoreTabataBlock(
  target: WorkoutExercise[],
  input: CoreTabataBlockInput,
) {
  return buildTabataBlock('tabata', target, {
    tabataPool: input.corePool,
    userLevel: input.userLevel,
    location: input.location,
    availableEquipment: input.availableEquipment,
    injuryShield: input.injuryShield,
    maxExercises: input.memberCount,
    minExercises: input.memberCount, // force the exact chosen count, not "up to"
  });
}

/**
 * Pick 2, 4, or 8 based on remaining time headroom. The block's own cost is
 * fixed (4 minutes, David's decision) regardless of member count — this
 * only decides how many DIFFERENT exercises rotate through the SAME 8
 * intervals (2×4 rounds / 4×2 rounds / 8×1 round), so it's really a variety
 * dial, not a duration one. Bands are a first, documented pass — tune freely,
 * nothing downstream depends on the exact thresholds beyond validity
 * (TABATA_CORE_MEMBER_COUNTS is the source of truth for which counts tile 8).
 */
export function chooseCoreTabataMemberCount(headroomMinutes: number): 2 | 4 | 8 {
  if (headroomMinutes >= 15) return 8;
  if (headroomMinutes >= 8) return 4;
  return 2;
}

export { TABATA_CORE_MEMBER_COUNTS };
