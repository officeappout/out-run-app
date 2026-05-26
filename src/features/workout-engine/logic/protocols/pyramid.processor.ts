/**
 * Pyramid Protocol Processor
 *
 * Builds a Mechanical Leverage Pyramid per exercise.  Each pyramid has TWO
 * possible shapes per difficulty, chosen at random per exercise to add
 * session-length and stimulus variety.
 *
 * Phase 3.3 — Peak Set CNS Cap:
 *   Ascending / escalator-to-peak shapes are HARD-capped at 3 sets so the
 *   user arrives at the peak overload set with a fresh CNS.  Symmetric
 *   triangle waves (D2) retain their 5-set variant because they never
 *   overshoot current level — their fatigue cost is bounded.
 *
 *  • D1 (Light)     — Mechanical Warm-Up Climb (easier → current level)
 *                     A: offsets [-2, -1, 0],   reps [10, 8, 6]   sets 3
 *                     B: offsets [-3, -1, 0],   reps [12, 8, 6]   sets 3
 *
 *  • D2 (Balanced)  — Triangle Wave (symmetric — ascend then descend)
 *                     A: offsets [-2, 0, -2],            reps [6, 3, 6]
 *                     B: offsets [-4, -2, 0, -2, -4],    reps [8, 5, 3, 5, 8]
 *
 *  • D3 (Intense)   — Neurological Potentiation Peak Set (ascending peak)
 *                     Capped at 3 sets so the peak (+2) lands on a fresh CNS.
 *                     A: offsets [-2, 0, +2],   reps [6, 3, 1]    sets 3
 *                     B: offsets [-3, 0, +2],   reps [8, 3, 1]    sets 3
 *
 * Mechanical-only contract:
 *   Per calisthenics methodology, a pyramid ALWAYS mutates the lever —
 *   every step uses a different exercise variant in the same movement
 *   group.  A pyramid that keeps the same exercise across sets does not
 *   exist.  If the processor cannot resolve enough distinct variants
 *   (`MIN_DISTINCT_VARIANTS_FOR_MECHANICAL`) from
 *   `context.globalExercisePool`, it ABANDONS the pyramid stamp for that
 *   exercise — no `pyramidSequence`, no `repsSequence` — and the exercise
 *   reverts to standard straight sets so the UI never displays a
 *   "static" pyramid.
 *
 * The processor only mutates exercises whose `exerciseRole === 'main'`
 * (or undefined — defensive default).  Warmup / cooldown exercises are
 * left untouched.
 *
 * NOTE: Target selection (which 1-2 exercises receive the pyramid stamp)
 * happens UPSTREAM in `WorkoutGenerator.ts`.  This processor mutates
 * whatever array it receives — pass it a filtered subset and only those
 * exercises will be pyramidized.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type { ProtocolProcessor } from './protocol.types';
import type {
  WorkoutExercise,
  WorkoutGenerationContext,
  PyramidStep,
  DifficultyLevel,
} from '../workout-generator.types';
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import { resolveExerciseMedia } from '../../shared/utils/media-resolution.utils';
import { isTimeBasedExercise } from '../workout-budgeting.utils';
import { MG_TO_DOMAIN } from '../../shared/constants/domain-mapping.constants';

// ============================================================================
// CONFIG TABLES
// ============================================================================

// Movement-group → logical domain map is now imported from
// `../../shared/constants/domain-mapping.constants` as a single source of
// truth.  Must stay in lock-step with the generator's
// `PYRAMID_UPPER_COMPOUND_MGS` whitelist — when an MG appears there but
// is missing in MG_TO_DOMAIN, the processor's `domain` lookup returns
// `undefined` and the pyramid silently aborts.

// ============================================================================
// SKILL-FAMILY GUARD (prevents cross-contamination across coarse MGs)
// ============================================================================

/**
 * Some movement groups (notably `vertical_push`) bundle structurally
 * incompatible exercises — e.g. Handstand Pushups, Pike Pushups, Bar
 * Dips and Wall Walks all share `movementGroup === 'vertical_push'` in
 * the Firestore data even though their lever geometry and shoulder
 * angle are completely different.  When the parent seed is a specific
 * skill (Handstand, Planche, etc.), we MUST exclude candidates that
 * belong to a different skill family from the pyramid pool, or the
 * Mechanical Pyramid degenerates into "Dips ➡️ Pike Pushup ➡️
 * Handstand" nonsense.
 *
 * Detection is keyword-based against both Hebrew and English names plus
 * the document id.  An exercise that does NOT match any known family
 * is treated as "generic" (`null`) — generic candidates always pass
 * the filter so legitimate precursor variants (e.g. Wall Walk as a
 * Handstand stepping stone) aren't accidentally pruned.
 */
type SkillFamily =
  | 'handstand'
  | 'planche'
  | 'muscle_up'
  | 'front_lever'
  | 'back_lever'
  | 'dips'
  | 'human_flag';

interface FamilyDef {
  family: SkillFamily;
  keywords: string[]; // lowercased substrings — Hebrew + English + id slugs
}

const SKILL_FAMILIES: FamilyDef[] = [
  { family: 'handstand',   keywords: ['עמידת ידיים', 'handstand', 'hspu', 'pike push', 'pike-push', 'wall walk'] },
  { family: 'planche',     keywords: ['פלאנץ׳', 'planche'] },
  { family: 'muscle_up',   keywords: ['מאסל אפ', 'מאסל-אפ', 'muscle up', 'muscle-up', 'muscleup'] },
  { family: 'front_lever', keywords: ['דגלון קדמי', 'front lever', 'front-lever', 'frontlever'] },
  { family: 'back_lever',  keywords: ['דגלון אחורי', 'back lever', 'back-lever', 'backlever'] },
  { family: 'dips',        keywords: ['מקבילים', 'dip'] },
  { family: 'human_flag',  keywords: ['דגל אנושי', 'human flag', 'human-flag'] },
];

function resolveSkillFamily(ex: Exercise | { name: any; id: string }): SkillFamily | null {
  const nameAny = (ex as any).name;
  const nameHe = typeof nameAny === 'string' ? nameAny : (nameAny?.he ?? '');
  const nameEn = typeof nameAny === 'string' ? '' : (nameAny?.en ?? '');
  const id = (ex as any).id ?? '';
  const haystack = `${nameHe} ${nameEn} ${id}`.toLowerCase();

  for (const def of SKILL_FAMILIES) {
    for (const kw of def.keywords) {
      if (haystack.includes(kw.toLowerCase())) return def.family;
    }
  }
  return null;
}

/**
 * One step (set) in a pyramid shape, using elastic level ranges ("טווחים
 * אלסטיים") instead of a single fixed offset.
 *
 * The engine searches for the best exercise whose domain level falls
 * WITHIN [minOffset, maxOffset] (relative to domainLevel), preferring
 * the candidate closest to the midpoint of the window.  When no in-window
 * exercise is available the search gracefully expands outward — the window
 * defines the ideal range, not a hard wall.
 *
 * Three canonical slot roles (per coaching methodology):
 *   Warmup  — minOffset: -4, maxOffset: -2   (4–2 levels below anchor)
 *   Working — minOffset: -1, maxOffset:  0   (1 level below to current)
 *   Peak    — minOffset: +1, maxOffset: +2   (1–2 levels above anchor, D3 only)
 */
interface PyramidSlot {
  minOffset: number;  // inclusive lower bound (relative to domainLevel)
  maxOffset: number;  // inclusive upper bound (relative to domainLevel)
  reps:      number;  // target reps / hold-seconds for this set
}

interface PyramidShape {
  slots:   PyramidSlot[];
  sets:    number;            // = slots.length
  variant: 'short' | 'long'; // 3-step vs 5-step label for logging
}

interface PyramidShapeBundle {
  short: PyramidShape;
  long:  PyramidShape;
}

// Canonical slot templates — reused across shapes for DRY definition.
const SLOT_WARMUP  = (reps: number): PyramidSlot => ({ minOffset: -4, maxOffset: -2, reps });
const SLOT_WORKING = (reps: number): PyramidSlot => ({ minOffset: -1, maxOffset:  0, reps });
const SLOT_PEAK    = (reps: number): PyramidSlot => ({ minOffset: +1, maxOffset: +2, reps });

const PYRAMID_SHAPES: Record<DifficultyLevel, PyramidShapeBundle> = {
  1: {
    // D1 = Mechanical warm-up climb — easier variants → current level.
    // Pure ascending shape: capped at 3 sets per the Peak Set CNS rule
    // (Phase 3.3) so a long climb never accumulates more leverage fatigue
    // than the working sets can absorb.
    short: {
      slots: [SLOT_WARMUP(10), SLOT_WORKING(8), SLOT_WORKING(6)],
      sets: 3, variant: 'short',
    },
    long: {
      slots: [SLOT_WARMUP(12), SLOT_WORKING(8), SLOT_WORKING(6)],
      sets: 3, variant: 'long',
    },
  },
  2: {
    // D2 = Hypertrophy Triangle Wave — symmetric 5-set ramp up then down.
    //
    // STRICT 5-SET CONTRACT: the canonical D2 shape is the full triangle
    // wave [8, 5, 3, 5, 8] — ascending warmup → working apex → descending
    // back-off.  Both `short` and `long` variants are now bound to this
    // 5-set structure so any random-roll regression in the future cannot
    // truncate a D2 wave to 3 steps and starve hypertrophy stimulus.
    //
    // The wave never overshoots the user's current level (no peak slot),
    // so the 5-set form is physiologically safe — symmetry bounds CNS
    // load while supporting the larger volume budget hypertrophy needs.
    short: {
      slots: [SLOT_WARMUP(8), SLOT_WARMUP(5), SLOT_WORKING(3), SLOT_WARMUP(5), SLOT_WARMUP(8)],
      sets: 5, variant: 'short',
    },
    long: {
      slots: [SLOT_WARMUP(8), SLOT_WARMUP(5), SLOT_WORKING(3), SLOT_WARMUP(5), SLOT_WARMUP(8)],
      sets: 5, variant: 'long',
    },
  },
  3: {
    // Ascending to peak overload — neurological potentiation.  HARD-capped
    // at 3 sets (Phase 3.3 Peak Set rule): the +2 peak set MUST land on a
    // fresh nervous system.  Both variants are 3-step ramps; the 'long'
    // variant uses a deeper warm-up (-4) to widen the dynamic range
    // without adding sets.
    short: {
      slots: [SLOT_WARMUP(6), SLOT_WORKING(3), SLOT_PEAK(1)],
      sets: 3, variant: 'short',
    },
    long: {
      slots: [SLOT_WARMUP(8), SLOT_WORKING(3), SLOT_PEAK(1)],
      sets: 3, variant: 'long',
    },
  },
};

const MIN_DISTINCT_VARIANTS_FOR_MECHANICAL = 3;

/**
 * Calisthenics rule of thumb: 1 working rep ≈ 2.5 s of Time Under
 * Tension.  When a pyramid is stamped on a time-based parent (e.g. a
 * Handstand or Planche), the shape's rep counts must be physiologically
 * scaled to hold seconds at the data layer — NOT at the UI layer — so
 * every downstream consumer (preview drawer, active runner, share
 * card) reads the same accurate number.  Multiplier lives at module
 * scope so the dispatcher in `process()` and `buildStep()` agree.
 */
const TUT_REPS_TO_SECONDS = 2.5;

/**
 * Strict per-difficulty pyramid shape selector.
 *
 * Eliminates the legacy 50/50 random roll between `short` and `long`
 * variants so each difficulty deterministically delivers the
 * physiological intent the user contracted for:
 *
 *   • D1 (Light)    → short Mechanical Warm-Up Climb (3 sets [10, 8, 6]).
 *                     Note: D1 sessions are short-circuited to straight
 *                     sets in `WorkoutGenerator.selectProtocol()`, so this
 *                     branch is only reached via direct protocol
 *                     invocation; we still return a sane shape.
 *
 *   • D2 (Balanced) → 5-set Hypertrophy Triangle Wave [8, 5, 3, 5, 8].
 *                     Both variants in `PYRAMID_SHAPES[2]` are now bound
 *                     to the same 5-set structure so any future
 *                     refactor of the bundle cannot accidentally truncate
 *                     a D2 wave to 3 steps.  The symmetric ramp keeps
 *                     CNS load bounded while delivering the volume
 *                     stimulus a balanced session is contracted to give.
 *
 *   • D3 (Intense)  → long Neurological Peak Overload Pyramid
 *                     (3 sets [8, 3, 1] with deeper warmup −4 → +2 peak).
 *                     The 3-set Peak Set CNS cap (Phase 3.3) is preserved;
 *                     the deeper warmup widens the dynamic range without
 *                     adding sets so the +2 peak always lands fresh.
 */
function pickShape(diff: DifficultyLevel): PyramidShape {
  const bundle = PYRAMID_SHAPES[diff] ?? PYRAMID_SHAPES[2];
  if (diff === 3) return bundle.long;   // Peak Overload (3 sets, deeper warmup)
  if (diff === 2) return bundle.long;   // Hypertrophy Triangle Wave (5 sets, symmetric)
  return bundle.short;                  // D1 default — short warmup climb
}

// ============================================================================
// SHAPE CLASSIFICATION (Phase 3.4 — Smart Dynamic Branding)
// ============================================================================

/**
 * Two structural kinds of pyramid:
 *
 *  • 'peak' — Levels (or reps in fallback mode) climb monotonically and
 *    terminate at the highest tier.  Covers D1's warm-up climb and D3's
 *    neurological-potentiation ramp.  Branded "סט שיא" (Peak Set) in the
 *    UI because the entire effort funnels toward the final overload set.
 *
 *  • 'wave' — Levels rise then fall (or fall, rise, fall), so the final
 *    step is NOT the peak.  Covers D2's symmetric triangle wave where the
 *    return-to-regression sets matter as much as the apex.  Branded
 *    "פירמידה עולה-יורדת" so the user understands the rep volume on the
 *    descent isn't an accident.
 *
 * The helper inspects step `level` first (the engine writes it during
 * variant resolution); when levels are missing it falls back to `setIndex`
 * order plus rep direction as a defensive heuristic.
 */
export type PyramidShapeKind = 'peak' | 'wave';

interface ClassifiableStep {
  level?: number;
  targetReps?: number;
  targetHold?: number;
}

export function classifyPyramidShape(
  seq: ReadonlyArray<ClassifiableStep> | undefined | null,
): PyramidShapeKind {
  if (!seq || seq.length < 2) return 'peak'; // single-step / empty → trivially peak

  // Primary signal: step levels written by the processor.
  let prevLevel: number | undefined;
  let sawAnyLevel = false;
  for (const step of seq) {
    if (step.level == null) continue;
    sawAnyLevel = true;
    if (prevLevel != null && step.level < prevLevel) return 'wave';
    prevLevel = step.level;
  }
  if (sawAnyLevel) return 'peak';

  // Fallback: if levels are absent, infer from rep / hold direction.  A wave
  // shape has reps that DECREASE then INCREASE (volume ↓ at apex, ↑ on the
  // descent); a peak shape has reps that monotonically decrease.
  const values = seq.map((s) => s.targetHold ?? s.targetReps ?? null);
  let direction: 'down' | 'up' | null = null;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a == null || b == null) continue;
    if (b < a && direction === 'up') return 'wave';
    if (b > a && direction === 'down') return 'wave';
    if (b < a) direction = 'down';
    else if (b > a) direction = 'up';
  }
  return 'peak';
}

/**
 * Localized display label for the pyramid section header.  Keeps the
 * shape-detection rules co-located with the engine so the UI can stay a
 * dumb renderer of strings produced by a single source of truth.
 */
export function pyramidLabel(
  seq: ReadonlyArray<ClassifiableStep> | undefined | null,
): string {
  return classifyPyramidShape(seq) === 'wave'
    ? 'פירמידה עולה-יורדת'
    : 'סט שיא';
}

// ============================================================================
// HELPERS
// ============================================================================

interface LevelCandidate {
  exercise: Exercise;
  level: number;
  gap: number;
}

/**
 * Resolve an exercise's level for a specific domain by scanning its
 * `targetPrograms`.  Returns `null` when the exercise has no entry that
 * resolves to the requested domain.
 */
function resolveLevelForDomain(exercise: Exercise, domain: string): number | null {
  const tps = exercise.targetPrograms ?? [];
  for (const tp of tps) {
    if (tp.programId === domain || resolveToSlug(tp.programId) === domain) {
      return tp.level;
    }
  }
  return null;
}

/**
 * Find the best level-matched variant using a three-tier search so the
 * pyramid degrades gracefully instead of aborting on shallow skill pools.
 *
 * Tier 1 — Exact skill family (highest priority)
 *   Candidates must share the parent's SkillFamily, OR carry no family
 *   keyword at all (null family = generic precursor, always allowed so
 *   progressions like Wall Walk ↦ Handstand aren't pruned).
 *
 * Tier 2 — Broader movement group (fallback)
 *   If Tier 1 yields nothing, the family filter is fully relaxed and any
 *   exercise in the same movementGroup is eligible.  This keeps the
 *   pyramid alive even when the skill family pool is sparse (e.g.
 *   Handstand steps supplemented by Pike Pushup or Dip).
 *
 * Tier 3 — Abort (final resort)
 *   Only triggered when the entire movementGroup has zero valid, unseen
 *   candidates — the caller then abandons the pyramid and falls back to
 *   standard straight sets.
 *
 * `excludeIds` (= seenIds from the caller) is enforced across ALL tiers
 * to prevent consecutive duplicates in the pyramid sequence.
 *
 * `preferDirection` encodes the physiological intent of THIS step's slot:
 *   • 'above' — peak / overload slot (positive shape offset): candidates
 *     BELOW targetLevel receive a DIRECTION_PENALTY-sized gap penalty so
 *     the engine prefers at/above the target before regressing.
 *   • 'below' — warm-up slot (negative shape offset): candidates ABOVE
 *     targetLevel receive the same penalty so the climb stays gentle.
 *   • 'either' — working-weight slot (offset = 0): no directional bias.
 * The penalty value mirrors `DIRECTION_PENALTY = 3` in
 * WorkoutGenerator.findLevelAppropriateSubstitute so both selection paths
 * agree on the strength of the bias.
 */
const DIRECTION_PENALTY = 3;
type PreferDirection = 'above' | 'below' | 'either';

/**
 * Coarse movement-group fallback for skill pyramids.
 *
 * When a skill MG (e.g. 'planche') has fewer than the required number of
 * distinct exercise variants in the pool, warmup and working-weight slots
 * may be filled from the related foundational movement groups listed here.
 * This keeps the pyramid alive — a planche specialist can warm up with
 * generic push/pike work before hitting the skill peak.
 *
 * IMPORTANT: This fallback is intentionally restricted to `preferDirection`
 * 'below' or 'either' slots. Peak slots ('above') are NEVER supplemented
 * with coarse-MG exercises so the overload step always remains a true skill
 * challenge at the user's target level.
 */
const SKILL_MG_TO_COARSE_MGS: Record<string, string[]> = {
  planche:          ['vertical_push', 'horizontal_push'],
  handstand_pushup: ['vertical_push'],
  muscle_up:        ['vertical_pull', 'horizontal_pull'],
  front_lever:      ['horizontal_pull', 'vertical_pull'],
  back_lever:       ['horizontal_pull', 'vertical_pull'],
  one_arm_pullup:   ['vertical_pull'],
  human_flag:       ['horizontal_pull', 'core'],
};

/**
 * Find the best exercise variant for a single pyramid step.
 *
 * Selection uses an elastic level window [minLevel, maxLevel].  Candidates
 * whose domain level falls inside the window are always preferred over those
 * outside it.  Among ties, the candidate closest to the window midpoint wins,
 * with `preferDirection` as a final tie-break.
 *
 * Family guard (critical for contamination prevention):
 *   When `parentFamily` is set (e.g. 'planche'), only exercises sharing that
 *   family OR carrying no family keyword (null — generic precursors) are
 *   considered.  Cross-family contamination (Dips into a Handstand pyramid)
 *   is never allowed at any tier.  If the family-safe pool is exhausted the
 *   function falls through to the Tier-3+ coarse-MG fallback.
 */
function findVariantAtLevel(
  pool: Exercise[],
  movementGroup: string,
  domain: string,
  minLevel: number,
  maxLevel: number,
  parentFamily: SkillFamily | null,
  excludeIds: Set<string>,
  preferDirection: PreferDirection,
): LevelCandidate | null {
  const midpoint = (minLevel + maxLevel) / 2;

  // Is a level within the elastic window?
  const inWindow = (level: number): boolean => level >= minLevel && level <= maxLevel;

  // Gap from window midpoint — the primary sort key.
  const gapFromMid = (level: number): number => Math.abs(level - midpoint);

  // Sort comparator:
  //   1. In-window candidates beat out-of-window ones.
  //   2. Closer to midpoint wins.
  //   3. Directional tie-break — physiologically correct side.
  const bestOf = (arr: LevelCandidate[]): LevelCandidate | null => {
    if (arr.length === 0) return null;
    arr.sort((a, b) => {
      const aIn = inWindow(a.level);
      const bIn = inWindow(b.level);
      if (aIn !== bIn) return aIn ? -1 : 1;                  // in-window first
      const gapDiff = gapFromMid(a.level) - gapFromMid(b.level);
      if (gapDiff !== 0) return gapDiff;                     // closer to midpoint
      // Directional tie-break (equal distance from midpoint)
      if (preferDirection === 'above') return b.level - a.level; // higher level wins
      if (preferDirection === 'below') return a.level - b.level; // lower level wins
      return 0;
    });
    return arr[0];
  };

  // Build the full unseen MG candidate pool in one pass.
  // gap stored as midpoint-distance so callers can inspect it in logs.
  const mgCandidates: LevelCandidate[] = [];
  for (const ex of pool) {
    if (excludeIds.has(ex.id)) continue;
    if (ex.movementGroup !== movementGroup) continue;
    const level = resolveLevelForDomain(ex, domain);
    if (level == null) continue;
    mgCandidates.push({ exercise: ex, level, gap: gapFromMid(level) });
  }

  // ── Tier-3+ coarse-MG fallback helper ──────────────────────────────────
  // Shared by both the "empty MG pool" and the "empty family-safe pool" paths.
  // Only fires for non-peak slots so the overload step always remains a
  // genuine skill exercise.
  const tryCoarseMGFallback = (): LevelCandidate | null => {
    if (preferDirection === 'above') return null; // peak slots never use coarse MG
    const coarseMGs = SKILL_MG_TO_COARSE_MGS[movementGroup];
    if (!coarseMGs || coarseMGs.length === 0) return null;
    const coarseCandidates: LevelCandidate[] = [];
    for (const ex of pool) {
      if (excludeIds.has(ex.id)) continue;
      if (!coarseMGs.includes(ex.movementGroup ?? '')) continue;
      const tp0 = ex.targetPrograms?.[0];
      if (!tp0?.level) continue;
      coarseCandidates.push({
        exercise: ex,
        level: tp0.level,
        gap: gapFromMid(tp0.level),
      });
    }
    if (coarseCandidates.length > 0) {
      console.log(
        `[PyramidProcessor] Tier-3+ coarse-MG fallback: "${movementGroup}" ` +
        `family-safe pool empty — using [${coarseMGs.join('/')}] for ` +
        `${preferDirection} slot (window L${minLevel}–L${maxLevel}, ` +
        `${coarseCandidates.length} candidate(s))`,
      );
      return bestOf(coarseCandidates);
    }
    return null;
  };

  // Tier-3 guard — entire skill MG has zero unseen candidates.
  if (mgCandidates.length === 0) {
    return tryCoarseMGFallback();
  }

  if (parentFamily) {
    // Tier 1 — family-safe candidates only (parentFamily OR null/generic).
    // `bestOf` naturally considers out-of-window exercises too (they just rank
    // lower), so this single call handles both the in-window and the graceful
    // out-of-window fallback within the family-safe set.
    const tier1 = mgCandidates.filter((c) => {
      const cf = resolveSkillFamily(c.exercise);
      return cf === parentFamily || cf === null;
    });
    const t1Result = bestOf(tier1);
    if (t1Result) return t1Result;

    // Family-safe pool is completely exhausted — DO NOT fall through to
    // cross-family candidates.  Dips must never enter a Handstand pyramid.
    // Try coarse-MG warmup fallback instead.
    console.log(
      `[PyramidProcessor] Tier-2: family-safe pool exhausted for ` +
      `"${parentFamily}" in "${movementGroup}" (window L${minLevel}–L${maxLevel}) — ` +
      `attempting coarse-MG fallback.`,
    );
    return tryCoarseMGFallback();
  }

  // No parentFamily constraint: best match across the full MG pool.
  return bestOf(mgCandidates);
}

/**
 * Build a PyramidStep from a resolved variant + raw shape rep count.
 *
 * `isTimeBased` is evaluated PER-VARIANT by the caller (Phase 3.4) — never
 * inherited from the parent seed — so a rep-based parent like 'מתח' can
 * host time-based peak variants like 'החזקת מתח ב-120°' without leaking
 * the parent's metric into the child step.  When the variant is
 * time-based, the raw rep count is scaled by `TUT_REPS_TO_SECONDS` so the
 * stored `targetHold` is the physiologically accurate number of seconds.
 * Downstream readers (preview drawer, active runner) MUST trust this
 * value verbatim — never re-apply scaling on top of it.
 */
function buildStep(
  setIndex: number,
  variant: Exercise,
  reps: number,
  isTimeBased: boolean,
  level: number | undefined,
): PyramidStep {
  const { imageUrl, videoUrl } = resolveExerciseMedia(variant as any, null);
  const target = isTimeBased
    ? { targetHold: Math.round(reps * TUT_REPS_TO_SECONDS) }
    : { targetReps: reps };

  return {
    setIndex,
    exerciseId: variant.id,
    name: getLocalizedText(variant.name, 'he'),
    ...target,
    videoSrc: videoUrl,
    imageUrl,
    level,
  };
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const PyramidProcessor: ProtocolProcessor = {
  name: 'pyramid',

  matches: (protocolName) => protocolName === 'pyramid',

  process: (exercises, context: WorkoutGenerationContext) => {
    const difficulty: DifficultyLevel = (context.difficulty ?? 2) as DifficultyLevel;
    const pool = context.globalExercisePool ?? [];

    let mechanicalCount = 0;
    let skippedCount = 0;
    let shortCount = 0;
    let longCount = 0;

    for (const we of exercises) {
      const role = we.exerciseRole;
      if (role && role !== 'main') continue; // skip warmup/cooldown

      // Roll an independent shape per exercise so a workout can mix
      // 3-step and 5-step pyramids side-by-side.
      const shape = pickShape(difficulty);

      // NOTE: Per-step metric is now resolved INSIDE the loop below from
      // `variant.exercise`, not from the parent.  A pyramid seeded on
      // 'מתח' (reps) can legitimately contain 'החזקת מתח ב-120°' (hold)
      // as a peak variant — the parent flag would mis-route that step's
      // value into `targetReps` instead of TUT-scaled `targetHold`.
      const movementGroup = we.exercise.movementGroup;
      const domain = movementGroup ? MG_TO_DOMAIN[movementGroup] : undefined;
      // Priority chain for the pyramid anchor level:
      //   1. User's domain-specific track level (most accurate — e.g. planche = L7)
      //   2. The anchor exercise's own resolved program level (avoids a push exercise
      //      anchoring at the wrong global level when the user has no 'push' track)
      //   3. Global composite user level (last resort)
      const domainLevel = domain
        ? (context.userProgramLevels?.get(domain) ?? we.programLevel ?? context.userLevel ?? 1)
        : (we.programLevel ?? context.userLevel ?? 1);

      // ── Build the mechanical sequence (the ONLY supported pyramid mode) ─
      let pyramidSequence: PyramidStep[] | null = null;

      if (movementGroup && pool.length > 0 && domain) {
        const sequence: PyramidStep[] = [];
        const seenIds = new Set<string>();
        // Resolve parent family once so Tier-1 logic is consistent
        // across every step in this exercise's pyramid.
        const parentFamily = resolveSkillFamily(we.exercise);

        for (let i = 0; i < shape.sets; i++) {
          const slot = shape.slots[i];
          // Compute the elastic level window for this slot.
          const minLevel = Math.max(1, domainLevel + slot.minOffset);
          const maxLevel = Math.max(1, domainLevel + slot.maxOffset);
          // Derive physiological intent from the window's position relative
          // to domainLevel:
          //   both bounds above 0 → peak slot (prefer ABOVE)
          //   both bounds below 0 → warmup slot (prefer BELOW)
          //   window straddles 0  → working-weight slot (no bias)
          const preferDirection: PreferDirection =
            slot.minOffset > 0 ? 'above' :
            slot.maxOffset < 0 ? 'below' : 'either';
          const variant = findVariantAtLevel(
            pool, movementGroup, domain, minLevel, maxLevel, parentFamily, seenIds, preferDirection,
          );
          if (!variant) {
            // Tier-3: entire MG exhausted — abandon pyramid for this exercise.
            sequence.length = 0;
            break;
          }
          // Per-step metric resolution (Phase 3.4).  We consult TWO sources:
          //   1. Legacy Firestore-only `metric === 'hold'` (some docs carry
          //      this without a proper `type: 'time'`).
          //   2. The canonical `isTimeBasedExercise()` helper which checks
          //      `type`, `mechanicalType`, dynamic-group guards, and name
          //      heuristics.
          // Either condition flips the step into the TUT-scaled targetHold
          // branch in `buildStep`, fixing the parent→child schema leak that
          // routed 'החזקת מתח' steps as 'X חזרות'.
          const stepIsTimeBased =
            (variant.exercise as any).metric === 'hold' ||
            isTimeBasedExercise(variant.exercise);
          sequence.push(
            buildStep(i, variant.exercise, slot.reps, stepIsTimeBased, variant.level),
          );
          seenIds.add(variant.exercise.id);
        }

        if (sequence.length === shape.sets && seenIds.size >= MIN_DISTINCT_VARIANTS_FOR_MECHANICAL) {
          pyramidSequence = sequence;
        }
      }

      if (pyramidSequence) {
        // ── Mechanical Pyramid stamped ───────────────────────────────────
        if (shape.variant === 'short') shortCount++; else longCount++;
        we.sets = shape.sets;
        we.pyramidSequence = pyramidSequence;
        // Keep `repsSequence` in sync so the active-workout state machine
        // can read per-set targets even if it falls back to the rep-only
        // path on legacy code paths.
        we.repsSequence = shape.slots.map((s) => s.reps);
        we.reasoning = [
          ...we.reasoning,
          `pyramid:mechanical(D${difficulty},${shape.variant},variants=${pyramidSequence
            .map((s) => `L${s.level ?? '?'}-${s.exerciseId.slice(0, 4)}`)
            .join('→')},reps=[${shape.slots.map((s) => s.reps).join(',')}])`,
        ];
        mechanicalCount++;
      } else {
        // ── Shallow group — pyramid is impossible, revert to straight ───
        // Per methodology, a pyramid where the exercise stays static does
        // not exist.  Clear any inherited pyramid hints so the UI shows a
        // normal exercise card.
        we.pyramidSequence = undefined;
        we.repsSequence = undefined;
        we.reasoning = [
          ...we.reasoning,
          `pyramid:skipped(D${difficulty},${shape.variant},reason=shallow_group:${movementGroup ?? 'no_mg'})`,
        ];
        skippedCount++;
      }
    }

    console.log(
      `[PyramidProcessor] D${difficulty} — mechanical=${mechanicalCount} (short=${shortCount}, long=${longCount}), ` +
      `skipped=${skippedCount} (shallow groups reverted to straight sets)`,
    );

    return exercises;
  },
};
