/**
 * Workout Engine — Shared Domain & Gear Constants
 *
 * Single source of truth for two long-duplicated artifacts:
 *
 *   1. MG_TO_DOMAIN — canonical movementGroup → logical domain map.
 *      Foundational MGs map to their parent compound domain ('push'/'pull'/
 *      'legs'/'core'); skill MGs map to their own canonical program slug
 *      so domain-level lookups (e.g. `userProgramLevels.get('planche')`)
 *      resolve correctly instead of falling back to the coarse push/pull
 *      track.  Previously this map was inlined in 5 files
 *      (WorkoutGenerator, pyramid.processor, home-workout.service,
 *      trio-modifiers.service, plus a partial copy as MG_TO_OWN_DOMAIN).
 *
 *   2. collectMethodGear — unified gear-id collector for an
 *      ExecutionMethod-shaped object.  Merges `equipmentIds + equipmentId`
 *      and `gearIds + gearId` into a single de-duplicated string array
 *      with empty/undefined entries stripped.  Returns RAW (un-normalized)
 *      ids — callers that need normalization should map through
 *      `normalizeGearId` from `gear-mapping.utils.ts`.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

/**
 * Canonical movementGroup → logical domain map.
 *
 * Foundational MGs:
 *   vertical_pull / horizontal_pull           → 'pull'
 *   vertical_push / horizontal_push           → 'push'
 *   squat / hinge / lunge                     → 'legs'
 *   core / anti_extension / anti_rotation     → 'core'
 *
 * Skill MGs (each maps to its own canonical program slug):
 *   planche, muscle_up, handstand_pushup,
 *   front_lever, back_lever,
 *   one_arm_pullup, human_flag
 *
 * Must stay in lock-step with the generator's `PYRAMID_UPPER_COMPOUND_MGS`
 * whitelist — when an MG appears there but is missing here, downstream
 * `domain` lookups return `undefined` and protocol stamping silently
 * aborts.
 */
export const MG_TO_DOMAIN: Record<string, string> = {
  // ── Foundational compound MGs ──────────────────────────────────────
  vertical_pull:    'pull',  horizontal_pull:  'pull',
  vertical_push:    'push',  horizontal_push:  'push',
  squat:            'legs',  hinge:            'legs',  lunge:         'legs',
  core:             'core',  anti_extension:   'core',  anti_rotation: 'core',
  // ── Skill MGs — each maps to its own canonical program slug ────────
  planche:          'planche',
  muscle_up:        'muscle_up',
  handstand_pushup: 'handstand_pushup',
  front_lever:      'front_lever',
  back_lever:       'back_lever',
  one_arm_pullup:   'one_arm_pullup',
  human_flag:       'human_flag',
};

/**
 * Unified gear-id collector — replaces the inline closures previously
 * duplicated in `ContextualEngine.findMatchingMethod`,
 * `WorkoutGenerator.applySynergyBonuses` (twice), and
 * `trio-modifiers.collectAllGearIds`.
 *
 * Merges the four shapes Firestore exercise documents may carry:
 *   - method.equipmentIds: string[]   (preferred)
 *   - method.equipmentId:  string     (legacy singular)
 *   - method.gearIds:      string[]   (preferred)
 *   - method.gearId:       string     (legacy singular)
 *
 * Returns RAW (un-normalized) ids.  Callers that need canonical ids
 * should pipe the result through `normalizeGearId` from
 * `gear-mapping.utils.ts`.
 */
export function collectMethodGear(
  method:
    | { gearIds?: string[]; gearId?: string; equipmentIds?: string[]; equipmentId?: string }
    | null
    | undefined,
): string[] {
  if (!method) return [];
  const ids: string[] = [];
  if (method.equipmentIds?.length) ids.push(...method.equipmentIds);
  else if (method.equipmentId)     ids.push(method.equipmentId);
  if (method.gearIds?.length)      ids.push(...method.gearIds);
  else if (method.gearId)          ids.push(method.gearId);
  return ids.filter(Boolean);
}

// ============================================================================
// BOLT-1 (DIFFICULTY 1) RECOVERY WINDOW
// ============================================================================
//
// The legacy rigid `Math.max(1, referenceLevel − 3)` ceiling cropped the
// recovery pool to a single deep regression, which routinely starved the
// session down to 1–2 admissible exercises for advanced users.
//
// Replacement contract: an elastic window 1–3 levels below the user's
// skill reference.  A pool filter (`isWithinBolt1Window`) and a search
// anchor (`getBolt1WindowAnchor`) are both derived from the SAME pair of
// offsets so the main pool and the guarantee passes radiate from exactly
// the same physiological zone — no drift, no asymmetric ceilings.

/** Offsets that define the recovery window relative to `referenceLevel`. */
const BOLT1_WINDOW_LOWER_OFFSET = -3; // floor (deepest admissible regression)
const BOLT1_WINDOW_UPPER_OFFSET = -1; // ceiling (most aggressive admissible level)

/**
 * Predicate: does `exerciseLevel` fall inside the Bolt-1 recovery window
 * `[referenceLevel − 3, referenceLevel − 1]` (inclusive)?
 *
 * Bounds are clamped to L1 so a low `referenceLevel` (e.g. L3) does not
 * collapse the window to a negative range.  Callers that also wish to
 * admit unleveled exercises (e.g. warmup MGs whose `programLevel` is 0)
 * must OR-in their own pass-through:
 *
 *   level === 0 || isWithinBolt1Window(level, ref)
 *
 * Used by `WorkoutGenerator.applyBolt1Cap()` to filter the candidate
 * pool.  Stays in lock-step with `getBolt1WindowAnchor` so guarantee
 * passes searching from the anchor always land inside this window.
 */
export function isWithinBolt1Window(
  exerciseLevel: number,
  referenceLevel: number,
): boolean {
  const lower = Math.max(1, referenceLevel + BOLT1_WINDOW_LOWER_OFFSET);
  const upper = Math.max(1, referenceLevel + BOLT1_WINDOW_UPPER_OFFSET);
  return exerciseLevel >= lower && exerciseLevel <= upper;
}

/**
 * Search anchor for D1 guarantee fallback passes — the centroid of the
 * Bolt-1 window: `referenceLevel − 2`.  Used as the level around which
 * `findLevelAppropriateSubstitute` (and the VFG candidate scoring loop)
 * radiates outward.  Anchoring at the centroid guarantees that:
 *
 *   1. The first hits inside ±1 are always inside the admissible window.
 *   2. The pool filter and the guarantee fallback share the same
 *      physiological centre — no drift between which exercises pass the
 *      cap and which are picked up by guarantees.
 *
 * Clamped to L1 so a low reference level (≤ L2) does not produce a
 * non-positive anchor.
 */
export function getBolt1WindowAnchor(referenceLevel: number): number {
  return Math.max(1, referenceLevel - 2);
}
