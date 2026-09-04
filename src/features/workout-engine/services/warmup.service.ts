/**
 * Warmup Service
 *
 * Prepends domain-matched movement-preparation exercises to a generated
 * workout. Selects one general mobility drill plus one L1-L2 strength
 * regression per child domain present in the main workout.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import {
  type GeneratedWorkout,
  type WorkoutExercise,
} from '../logic/WorkoutGenerator';
import { type DifficultyLevel, resolveTier, type TierName } from '../logic/workout-generator.types';
import { resolveExerciseLevelForDomains } from '../logic/workout-selection.utils';
import { isTimeBasedExercise } from '../logic/workout-budgeting.utils';
import { resolveToSlug } from './program-hierarchy.utils';
import {
  isEssentialGear,
  HOME_EXCLUSIVE_GEAR_IDS,
} from './trio-modifiers.service';
import { collectMethodGear } from '../shared/constants/domain-mapping.constants';
import { warmupSlotBudget } from '../logic/session-frame.utils';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Warmup Zone (Sprint 4):
 *   Level 1–2: General Mobility ONLY — no regressions, no potentiation.
 *   Level 3+:  MaxWarmupLevel = UserLevel − 2 (min 1).
 *              Primes the CNS without causing fatigue.
 */
function getWarmupZone(userLevel: number): { min: number; max: number } {
  if (userLevel <= 2) return { min: 0, max: 0 }; // sentinel: caller skips B & C
  const max = Math.max(1, userLevel - 2);
  const min = 1;
  return { min, max };
}

/** Warmup reps for blood flow (no fatigue) */
const WARMUP_REPS = 15;

/** Warmup hold seconds for time-based exercises */
const WARMUP_HOLD_SECONDS = { min: 30, max: 45 };

/** Short rest between warmup exercises (seconds) */
const WARMUP_REST_SECONDS = 15;

/** Gear IDs to exclude from warmup (bands, TRX, personal gear) */
const BANNED_WARMUP_GEAR_IDS = new Set(['I1K30JehaxSx8dlBOZyd', '7gLOFEfgSvInu7lfLHxV']);

// ============================================================================
// WARMUP LADDER — David Scale constants & types
// ============================================================================

/** Moderate-rep range for Slots 1 & 2 (blood flow, movement rehearsal) */
const ACTIVATION_REPS = { min: 8, max: 12 };

/** Low-rep range for Slots 3 & 4 (neural priming, CNS potentiation) */
const PRIMING_REPS = { min: 3, max: 5 };

/** Maps specific movementGroup values to the three broad training patterns */
const MG_TO_BROAD_PATTERN: Record<string, 'push' | 'pull' | 'legs'> = {
  vertical_pull:   'pull',
  horizontal_pull: 'pull',
  vertical_push:   'push',
  horizontal_push: 'push',
  squat:  'legs',
  hinge:  'legs',
  lunge:  'legs',
};

/** All movementGroups that belong to the legs broad pattern */
const LEGS_MGs = new Set(['squat', 'hinge', 'lunge']);

/**
 * Context-aware percentage bands per (totalSlots, slotPosition).
 *
 * The same slot index represents a different intensity point depending on
 * how many total slots the family was assigned.  This mirrors elite
 * "Ramp Up" sets: the ladder is always anchored at the same ceiling (~85%
 * of domainLevel) but the floor spread changes with ladder length.
 *
 *   totalSlots=1: [60%–85%]                           (Direct Priming)
 *   totalSlots=2: [25%–40%], [65%–85%]                (Activation → Priming)
 *   totalSlots=3: [25%–40%], [40%–65%], [65%–85%]     (Light → Medium → Heavy)
 *   totalSlots=4: [20%–35%], [35%–55%], [55%–70%], [70%–85%]  (Full Ramp)
 *
 * Index is slotIndex−1 (0-based into the array).
 */
const SLOT_PCT_TABLE: Record<number, [number, number][]> = {
  1: [[0.60, 0.85]],
  2: [[0.25, 0.40], [0.65, 0.85]],
  3: [[0.25, 0.40], [0.40, 0.65], [0.65, 0.85]],
  4: [[0.20, 0.35], [0.35, 0.55], [0.55, 0.70], [0.70, 0.85]],
};

/**
 * Rep range for a slot based on its position within the total ladder.
 * The LAST slot is always neural priming (low reps); all preceding slots
 * are activation (moderate reps).
 */
function getSlotReps(slotIndex: number, totalSlots: number): { min: number; max: number } {
  return slotIndex === totalSlots ? PRIMING_REPS : ACTIVATION_REPS;
}

/**
 * Internal type: one "family" bucket derived from the main workout.
 * A family is the resolved program slug (e.g. 'pull', 'muscle_up', 'planche').
 * Each family receives a number of warmup slots proportional to its
 * weight in the workout via the David Scale.
 */
interface FamilyWeight {
  /** Resolved slug, e.g. 'pull', 'muscle_up', 'planche' */
  familyId: string;
  /** Broad pattern for Mandatory Legs Rule */
  broadPattern: 'push' | 'pull' | 'legs' | 'other';
  /** Number of main exercises belonging to this family */
  count: number;
  /** count / totalMainExercises (0.0–1.0) */
  weight: number;
  /** User's level in this family from userProgramLevels */
  domainLevel: number;
  /** Warmup slots assigned by David Scale */
  slots: 1 | 2 | 3 | 4;
}

// ============================================================================
// WARMUP LADDER — Helper functions
// ============================================================================

/**
 * Compute the level window for slot `slotIndex` within a ladder of
 * `totalSlots` slots for a domain at `domainLevel`.
 *
 * Percentage bands come from SLOT_PCT_TABLE — they are context-aware:
 * the same slot index means a different intensity point depending on how
 * many total slots the family was assigned (Direct Priming for 1-slot
 * families, full ramp for 4-slot families).
 *
 * Elite Floor: when domainLevel ≥ 15 the minimum band is clamped to L5
 * so advanced users never warm up below a meaningful intensity.
 *
 * 4-slot hard cap: the final slot of a 4-slot ladder is additionally
 * capped at domainLevel − 2 to prevent CNS overload right before
 * working sets.
 *
 * Returns null when the computed zone collapses (domainLevel too low for
 * the requested slot).
 *
 * @param domainLevel   User's level in this family/domain.
 * @param slotIndex     1-based position of this slot in the ladder.
 * @param totalSlots    Total slots assigned to this family (1–4).
 */
function getSlotZone(
  domainLevel: number,
  slotIndex: 1 | 2 | 3 | 4,
  totalSlots: 1 | 2 | 3 | 4,
): { min: number; max: number } | null {
  const pcts = SLOT_PCT_TABLE[totalSlots] ?? SLOT_PCT_TABLE[3];
  const [minPct, maxPct] = pcts[slotIndex - 1] ?? pcts[pcts.length - 1];

  // Elite floor: users at L15+ never warm up below L5
  const eliteFloor = domainLevel >= 15 ? 5 : 1;

  let min = Math.max(eliteFloor, Math.floor(domainLevel * minPct));
  let max = Math.max(eliteFloor, Math.ceil(domainLevel * maxPct));

  // 4-slot ladder: hard-cap the final slot at domainLevel − 2
  // (never within 2 levels of the working set)
  if (totalSlots === 4 && slotIndex === 4) max = Math.min(max, domainLevel - 2);

  if (min > max || max < 1) return null;
  return { min, max };
}

/**
 * Scan the main workout and group exercises by "family"
 * (= resolveToSlug(targetPrograms[0].programId)).
 * Returns a FamilyWeight[] sorted by weight descending; slots are assigned
 * by assignSlots() in the next step.
 */
function analyzeMainExercises(
  mainExercises: WorkoutExercise[],
  userProgramLevels: Map<string, number>,
  maxUserLevel: number,
): FamilyWeight[] {
  const counts = new Map<string, { count: number; broadPattern: 'push' | 'pull' | 'legs' | 'other' }>();

  for (const we of mainExercises) {
    const ex = we.exercise;
    // Primary: resolved slug from first targetProgram
    const rawId = ex.targetPrograms?.[0]?.programId ?? '';
    const slug  = (rawId ? resolveToSlug(rawId) : '') || rawId;
    // Fallback: derive from movementGroup
    const mg = ex.movementGroup ?? '';
    const familyId = slug || MG_TO_BROAD_PATTERN[mg] || 'other';

    // Broad pattern for Mandatory Legs Rule
    const broad: 'push' | 'pull' | 'legs' | 'other' =
      MG_TO_BROAD_PATTERN[mg] ?? (
        ['pull', 'push', 'legs'].includes(familyId as string)
          ? (familyId as 'push' | 'pull' | 'legs')
          : 'other'
      );

    const prev = counts.get(familyId);
    if (prev) {
      prev.count++;
    } else {
      counts.set(familyId, { count: 1, broadPattern: broad });
    }
  }

  const total = mainExercises.length || 1;
  const families: FamilyWeight[] = [];

  for (const [familyId, { count, broadPattern }] of counts) {
    const weight = count / total;
    const domainLevel =
      userProgramLevels.get(familyId) ??
      userProgramLevels.get(resolveToSlug(familyId)) ??
      maxUserLevel;
    families.push({ familyId, broadPattern, count, weight, domainLevel, slots: 1 });
  }

  // Sort descending by weight so dominant families are processed first
  families.sort((a, b) => b.weight - a.weight);
  return families;
}

/**
 * Assign David Scale slot counts to each FamilyWeight.
 * Rules (applied in priority order):
 *   difficulty === 1 (Easy) → always 1 slot (no Priming)
 *   weight ≥ 0.65           → 4 slots (full ladder)
 *   weight ≥ 0.50           → 3 slots
 *   weight ≥ 0.30           → 2 slots (Activation + Priming)
 *   weight  < 0.30           → 1 slot  (Activation only)
 *
 * Full Body fallback: when 3+ distinct broadPatterns exist and every
 * weight < 30%, clamp all slots to 1.
 */
function assignSlots(
  families: FamilyWeight[],
  difficulty: DifficultyLevel | undefined,
): FamilyWeight[] {
  const broadPatterns = new Set(families.map(f => f.broadPattern));
  const isFullBody = broadPatterns.size >= 3 && families.every(f => f.weight < 0.30);

  return families.map(f => {
    let slots: 1 | 2 | 3 | 4;
    if (difficulty === 1 || isFullBody || f.broadPattern === 'other') {
      slots = 1;
    } else if (f.weight >= 0.65) {
      slots = 4;
    } else if (f.weight >= 0.50) {
      slots = 3;
    } else if (f.weight >= 0.30) {
      slots = 2;
    } else {
      slots = 1;
    }
    return { ...f, slots };
  });
}

/**
 * Collect the set of non-bodyweight gear IDs actually used by the main
 * workout exercises.  A warmup may only reference specialized gear (rings,
 * kettlebell, etc.) if that gear is already "out of the bag" here.
 */
function buildActiveMainGear(mainExercises: WorkoutExercise[]): Set<string> {
  const gear = new Set<string>();
  for (const ex of mainExercises) {
    const ids = collectMethodGear(ex.method as any);
    for (const id of ids) {
      const lower = id.toLowerCase();
      if (lower !== 'bodyweight' && lower !== 'none') gear.add(lower);
    }
  }
  return gear;
}

/**
 * Contextual gear check for a warmup candidate's execution method.
 *
 * Three-layer decision:
 *   1. Bodyweight / 'none' → always allowed.
 *   2. Banned gear (bands, TRX) → always rejected.
 *   3. Home-exclusive furniture (sofa, door-anchor) → always rejected.
 *   4. Essential park fixtures (pull-up bar, dip bar) → always allowed.
 *   5. Specialized gear (rings, kettlebell…) → allowed ONLY when that gear
 *      is already used by at least one main exercise (activeMainGear).
 */
function isGearContextuallyAllowed(
  method: ExecutionMethod,
  activeMainGear: Set<string>,
): boolean {
  const gearIds = collectMethodGear(method as any);
  for (const id of gearIds) {
    const lower = id.toLowerCase();
    if (lower === 'bodyweight' || lower === 'none') continue;
    if (BANNED_WARMUP_GEAR_IDS.has(id)) return false;
    if (HOME_EXCLUSIVE_GEAR_IDS.has(lower)) return false;
    if (!isEssentialGear(lower) && !activeMainGear.has(lower)) return false;
  }
  return true;
}

// ============================================================================
// SESSION-LOCAL VARIETY GUARD
// Tracks warmup IDs picked in the current browser session (survives refreshes
// until page reload). Prevents the same warmup from appearing on consecutive
// regenerations even without a DB save.
// ============================================================================
const _recentWarmupIds = new Set<string>();
const WARMUP_MEMORY_LIMIT = 12;

function recordWarmupPick(id: string) {
  _recentWarmupIds.add(id);
  if (_recentWarmupIds.size > WARMUP_MEMORY_LIMIT) {
    const first = _recentWarmupIds.values().next().value;
    if (first) _recentWarmupIds.delete(first);
  }
}

/**
 * Pick the best candidate from an array using jitter + variety guard.
 * Variety penalty: -20 for exercises used in recent warmup picks.
 * Jitter: 0-30 random bonus for healthy randomization.
 */
function pickWithVariety(candidates: Exercise[]): Exercise | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const scored = candidates.map(ex => {
    let score = Math.floor(Math.random() * 31); // jitter 0-30
    if (_recentWarmupIds.has(ex.id)) score -= 20;  // variety guard
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].ex;
}

// ============================================================================
// EQUIPMENT CHECK (shared with cooldown.service.ts)
// ============================================================================

export function isWarmupEquipmentAllowed(gearIds: (string | undefined)[], equipmentIds: (string | undefined)[]): boolean {
  const all = [...gearIds, ...equipmentIds].filter((id): id is string => Boolean(id));
  if (all.length === 0) return true;
  const lower = (id: string) => String(id).toLowerCase();
  return all.every((id) => {
    if (lower(id) === 'bodyweight' || lower(id) === 'none') return true;
    if (BANNED_WARMUP_GEAR_IDS.has(id)) return false;
    if (lower(id).includes('band') || lower(id).includes('trx')) return false;
    return true;
  });
}

// ============================================================================
// WARMUP PREPEND
// ============================================================================

/** Max potentiation warmups to add — overridden dynamically by difficulty below */
const DEFAULT_MAX_POTENTIATION_WARMUPS = 2;

/**
 * Check if an exercise qualifies as a general warmup / mobility candidate
 * for Part A (the single "general mobility" slot).
 *
 * An absolute ceiling of `userLevel` is enforced regardless of tag:
 * a warmup-tagged explosive exercise must not exceed the user's own level,
 * preventing CNS-overload priming.
 *
 * NOTE: This function is intentionally NOT used for Part B potentiation picks.
 * Part B uses isSpecificPotentiationCandidate which enforces stricter zone rules.
 */
function isPotentiationCandidate(ex: Exercise, userLevel: number): boolean {
  const level = ex.recommendedLevel ?? ex.targetPrograms?.[0]?.level ?? 0;
  const numLevel = typeof level === 'number' ? level : 0;

  // Absolute ceiling: never prime with an exercise above the user's own level,
  // regardless of exerciseRole or mobility tag.
  if (numLevel > userLevel) return false;

  if (ex.exerciseRole === 'warmup') return true;
  if ((ex.tags as string[] ?? []).includes('mobility')) return true;

  const zone = getWarmupZone(userLevel);
  return numLevel >= zone.min && numLevel <= zone.max;
}

/**
 * Candidate checker specifically for Part B (specific potentiation warmups).
 *
 * Two key differences from isPotentiationCandidate:
 *
 *   1. NO early-return bypass for `exerciseRole === 'warmup'` or `'mobility'` tags.
 *      Warmup-tagged exercises must obey the zone just like any other exercise.
 *      Without this guard, skill-intensive prep drills (e.g. a muscle-up swing
 *      tagged as `exerciseRole: 'warmup'`) slip into the candidate pool for a
 *      different-domain session (e.g. a L9-Pull workout) simply because their
 *      level passes the loose ceiling check.
 *
 *   2. Tighter zone ceiling: max = domainSpecificUserLevel − 4 (vs. − 2 in
 *      getWarmupZone).  This guarantees genuinely low-intensity priming and
 *      prevents any exercise from encroaching on working-set intensity:
 *        L5  → zone [1, 1]    L9  → zone [1, 5]
 *        L12 → zone [1, 8]    L18 → zone [1, 14]
 *
 * @param ex                     Exercise to evaluate.
 * @param domainSpecificUserLevel User's actual level in the program this exercise
 *                               belongs to — NOT the global maxUserLevel.
 *                               Passed per-exercise by the Part B filter.
 */
function isSpecificPotentiationCandidate(
  ex: Exercise,
  domainSpecificUserLevel: number,
): boolean {
  const raw = ex.recommendedLevel ?? ex.targetPrograms?.[0]?.level ?? 0;
  const numLevel = typeof raw === 'number' ? raw : 0;

  // Hard ceiling: exercise must not exceed the user's level in this domain.
  if (numLevel > domainSpecificUserLevel) return false;

  // Tighter potentiation zone: max = domainLevel − 4 (min 1).
  // Deliberately more conservative than getWarmupZone (−2) to keep warmup
  // intensity safely below working-set load.
  const zoneMax = Math.max(1, domainSpecificUserLevel - 4);
  return numLevel >= 1 && numLevel <= zoneMax;
}

/**
 * Perfect Warmup Recipe:
 *   Part A: EXACTLY 1 general warmup (exerciseRole === 'warmup' OR tags.includes('mobility'))
 *           Emergency fallback: any warmup-role exercise ignoring location, so the slot
 *           is NEVER empty.
 *   Part B: Potentiation — up to N exercises matching exact movementGroups from main workout.
 *           Three-tier fallback guarantees at least one item per active movement pattern:
 *             Tier 1 — strict zone (domainLevel-4)  + location/equipment filter
 *             Tier 2 — relaxed zone (domainLevel-2) + location/equipment filter
 *             Tier 3 — warmup-role exercises in same MG, location ignored
 *   Part C: Domain regression — 1 exercise in the Warmup Zone per domain NOT already primed
 *   ALL: bodyweight or basic park bars (no bands/TRX)
 *   ALL: session-local variety guard + jitter for healthy refresh variety
 */
export function prependWarmupExercises(
  workout: GeneratedWorkout,
  allExercises: Exercise[],
  userProgramLevels: Map<string, number>,
  location: ExecutionLocation,
  resolvedChildDomains: string[],          // kept for API compat; Part C removed
  selectedMainExercises?: WorkoutExercise[],
  difficulty?: DifficultyLevel,
  availableEquipment?: string[],           // session gear (Layer A — informational)
  /**
   * Session time budget (minutes). Warmup is INCLUDED in the user's budget
   * (product decision 10.07.2026), so the ladder scales with the session:
   * 15min → ~2min warmup (WARMUP_MIN_SLOTS injury-prevention floor),
   * 45min+ → the full 6-min ladder. Omitted → legacy ceiling (unchanged).
   */
  availableTimeMin?: number,
): void {
  const mainExercises = selectedMainExercises
    ?? workout.exercises.filter((ex) => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown');
  if (mainExercises.length === 0) return;

  // Derive active broad patterns for Mandatory Legs Rule and logging
  const activeBroadPatterns = new Set<string>();
  for (const ex of mainExercises) {
    const p = MG_TO_BROAD_PATTERN[ex.exercise.movementGroup ?? ''];
    if (p) activeBroadPatterns.add(p);
  }

  const workoutIds = new Set(workout.exercises.map((e) => e.exercise.id));
  const warmupBlock: WorkoutExercise[] = [];

  // Pre-compute gear actively used in main exercises — drives Layer B gating
  const activeMainGear = buildActiveMainGear(
    workout.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown'),
  );

  /**
   * Add one exercise to the warmup block.
   * @param repRange  Optional override for reps. Defaults to WARMUP_REPS (15).
   *                  Slot 1-2 → ACTIVATION_REPS {15-20}
   *                  Slot 3-4 → PRIMING_REPS {5-8}
   */
  const addToBlock = (
    ex: Exercise,
    reason: string,
    repRange?: { min: number; max: number },
    isGeneral = false,
    levelFields?: { programLevel: number; levelDelta: number; tier: TierName },
  ) => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    // Route method choice through the single-source selector (park→bodyweight,
    // never home) instead of the home-preferring find + `?? methods[0]` leak.
    const method = CONTEXT_AWARE_SELECTION_ENABLED
      ? selectMethodForContext(ex, location, availableEquipment ?? [])
      : (methods.find((m) => m.location === location || m.location === 'home' || m.locationMapping?.includes(location)) ?? methods[0]);
    if (!method) return;
    // Single source of truth (docs/workout-engine/06-TIME-VS-REPS.md): this used
    // to reimplement a subset of isTimeBasedExercise's logic inline, missing its
    // name-heuristic fallback (hold/plank/hang/החזק) — an exercise that only
    // qualifies via that fallback would warmup-select as reps-based here but
    // main-select as time-based, showing "6 חזרות" in one slot and "15 שניות"
    // in another for the identical exercise.
    const isTimeBased = isTimeBasedExercise(ex);
    const range = isTimeBased ? WARMUP_HOLD_SECONDS : (repRange ?? { min: WARMUP_REPS, max: WARMUP_REPS });
    const reps = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
    const warmupExercise = { ...ex, exerciseRole: 'warmup' as const };
    warmupBlock.push({
      exercise: warmupExercise,
      method,
      mechanicalType: (ex.mechanicalType || 'none') as any,
      sets: 1,
      reps,
      repsRange: isTimeBased ? WARMUP_HOLD_SECONDS : range,
      isTimeBased,
      restSeconds: WARMUP_REST_SECONDS,
      priority: 'accessory' as const,
      score: 0,
      reasoning: [reason],
      exerciseRole: 'warmup' as const,
      // Stage-1 general mobility warmup is pinned first by applyDomainPrioritySort.
      ...(isGeneral ? { isGeneralWarmup: true as const } : {}),
      // programLevel / levelDelta / tier for preparation warmups — so swap resolves a
      // same-level alternative instead of defaulting to level 1. General follow-along
      // guides pass none (they are level-agnostic and swap skips them).
      ...(levelFields ?? {}),
    });
    workoutIds.add(ex.id);
  };

  /**
   * Location-aware + contextual-gear check.
   * Requires a valid method for the current location AND passes
   * isGearContextuallyAllowed (furniture ban + activeMainGear gate).
   */
  const passesEquipmentAndLocation = (ex: Exercise): boolean => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = CONTEXT_AWARE_SELECTION_ENABLED
      ? selectMethodForContext(ex, location, availableEquipment ?? [])
      : methods.find((m) => m.location === location || m.location === 'home' || m.locationMapping?.includes(location));
    if (!method) return false;
    return isGearContextuallyAllowed(method as ExecutionMethod, activeMainGear);
  };

  /**
   * Location-only check for follow-along video guides.
   * Follow-along guides (joint rotations / mobility flows) need NO equipment, so we
   * gate them purely on location: a park rotation video must not surface at home.
   * Strict match (no home-universal fallback) so each guide stays in its own
   * locations; locationMapping lets one guide cover several (e.g. a home guide →
   * office/school).
   */
  const followAlongMatchesLocation = (ex: Exercise): boolean => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    return methods.some(
      (m) => m.location === location || (m.locationMapping?.includes(location) ?? false),
    );
  };

  // ── Pool diagnostics ────────────────────────────────────────────────────────
  // Log how many warmup-signal exercises are in the incoming pool so we can
  // quickly verify the pool is correctly populated from the full allExercises set.
  const warmupRoleCount = allExercises.filter(ex => ex.exerciseRole === 'warmup').length;
  const followAlongCount = allExercises.filter(ex => ex.isFollowAlong === true).length;
  const mobilityTagCount = allExercises.filter(
    ex => (ex.tags as string[] ?? []).includes('mobility'),
  ).length;
  console.log(
    `[Warmup] Pool: ${allExercises.length} total ` +
    `| follow-along: ${followAlongCount} ` +
    `| role=warmup: ${warmupRoleCount} ` +
    `| mobility-tag: ${mobilityTagCount}`,
  );

  // -- Part A: EXACTLY 1 general warmup (mobility / joint rotations) --
  //
  // Stage 1 — Location-routed follow-along guides:
  //   Follow-along video guides (`isFollowAlong === true`) are joint-rotation / mobility
  //   flows that require NO equipment but ARE tied to a filmed location. They are gated
  //   on LOCATION ONLY (followAlongMatchesLocation): a park rotation video must not
  //   surface at home, and vice versa. `locationMapping` lets one guide cover several
  //   locations (e.g. a home guide → office / school). The distinguisher is
  //   `isFollowAlong`, NOT `exerciseRole` — only real video guides skip the equipment
  //   gate; anything else takes the normal path.
  //
  //   Exercises that carry only the `mobility` tag (but are not follow-along) still
  //   pass through passesEquipmentAndLocation because they may have real equipment
  //   requirements that we do need to respect.
  //
  // Never-empty fallback:
  //   If NO follow-along guide matches this location (e.g. gym — we have no footage
  //   there), the slot must not silently disappear. Fall back to ANY follow-along guide
  //   that has a method, location ignored — joint rotations are location-agnostic, so an
  //   imperfect (non-location-matched) guide beats no warmup at all.
  const generalCandidates = allExercises.filter((ex) => {
    if (workoutIds.has(ex.id)) return false;
    // Track A1 — follow-along video guides: need NO equipment, but MUST match the
    // location. The distinguisher is `isFollowAlong`, NOT `exerciseRole`: only real
    // video guides get the no-equipment treatment, and they are location-routed so a
    // park rotation video never surfaces at home (and vice versa).
    if (ex.isFollowAlong === true) return followAlongMatchesLocation(ex);
    // Track A2 — mobility-tagged exercises: still must pass location/equipment.
    if ((ex.tags as string[] ?? []).includes('mobility')) {
      return passesEquipmentAndLocation(ex);
    }
    return false;
  });

  let stage1Name = '(none)';
  let stage1Source = 'none';

  if (generalCandidates.length > 0) {
    const chosen = pickWithVariety(generalCandidates)!;
    addToBlock(chosen, 'warmup: general mobility', undefined, true);
    recordWarmupPick(chosen.id);
    stage1Name = chosen.name?.he ?? chosen.name?.en ?? chosen.id;
    stage1Source = chosen.isFollowAlong === true ? 'follow-along [location-matched]' : 'mobility-tagged';
  } else {
    // Never-empty guarantee: no follow-along guide matches this location (e.g. gym —
    // we have no footage there). Rather than silently drop the general-mobility slot,
    // fall back to ANY follow-along guide with the location ignored. Joint rotations
    // are location-agnostic, so an imperfect (non-location-matched) guide beats none.
    const emergencyCandidates = allExercises.filter(ex =>
      !workoutIds.has(ex.id) &&
      ex.isFollowAlong === true &&
      (ex.execution_methods ?? ex.executionMethods ?? []).length > 0,
    );
    const fallback = pickWithVariety(emergencyCandidates);
    if (fallback) {
      addToBlock(fallback, 'warmup: general mobility [location-agnostic fallback]', undefined, true);
      recordWarmupPick(fallback.id);
      stage1Name = fallback.name?.he ?? fallback.name?.en ?? fallback.id;
      stage1Source = 'fallback [no location match — location-ignored]';
    }
  }

  console.log(`[Warmup] Stage 1: "${stage1Name}" selected (${stage1Source})`);

  // Derive a representative user level for potentiation (max across all domains)
  const maxUserLevel = userProgramLevels.size > 0
    ? Math.max(...Array.from(userProgramLevels.values()))
    : 1;

  // Level 1–2 users get ONLY General Mobility — skip Part B entirely
  const skipPotentiation = getWarmupZone(maxUserLevel).max === 0;
  if (skipPotentiation) {
    console.log(`[Warmup] Level ${maxUserLevel} ≤ 2 → General Mobility only`);
  }

  // ── Part B: David Scale — workout-aware weighted warmup ladder ─────────────
  //
  // 1. analyzeMainExercises: group mainExercises by family (targetPrograms slug)
  //    and compute each family's weight (count / total).
  // 2. assignSlots: apply David Scale to determine how many warmup slots each
  //    family deserves (1–4 depending on weight and difficulty).
  // 3. For each family, iterate over its slot indices (1..slots):
  //    a. getSlotZone: compute the intensity window for this slot.
  //    b. Build candidate pool from exercises with matching movementGroups.
  //    c. Three-tier fallback: Tier 1 (strict zone) → Tier 2 (relaxed zone) →
  //       Tier 3 (warmup-role, location bypass).
  //    d. Family-First F1–F4 selection within the resolved pool.
  //    e. addToBlock with ACTIVATION_REPS (slots 1-2) or PRIMING_REPS (slots 3-4).
  // 4. Mandatory Legs Guarantee: if legs are in the workout but no legs warmup
  //    was added, force one Slot-1 activation regardless of budget.
  // Part C (domain regressions) is decommissioned — superseded by this system.

  let potentiationCount = 0;
  const primedBroadPatterns = new Set<string>();

  if (!skipPotentiation) {
    // Step 1 & 2: analyse and assign slots
    const families = assignSlots(
      analyzeMainExercises(mainExercises, userProgramLevels, maxUserLevel),
      difficulty,
    );

    console.log(
      `[Warmup] David Scale: ${families.map(f =>
        `${f.familyId}(${Math.round(f.weight * 100)}%×${f.slots}s)`
      ).join(', ')}`,
    );

    // Helper: resolve domain level for an exercise (same logic as before)
    const getExDomainLevel = (ex: Exercise): number => {
      if (!ex.targetPrograms?.length) return maxUserLevel;
      for (const tp of ex.targetPrograms) {
        const lvl =
          userProgramLevels.get(tp.programId) ??
          userProgramLevels.get(resolveToSlug(tp.programId));
        if (lvl !== undefined) return lvl;
      }
      return maxUserLevel;
    };

    // Warmup-preparation level marking: mirror the strength path's level fields so a
    // swap resolves a same-level alternative (instead of defaulting to level 1).
    // Reuses the SAME primitives assignVolume uses — resolveExerciseLevelForDomains +
    // resolveTier — WITHOUT duplicating its volume/ramp logic. rampedTarget stays
    // undefined (warmups are never goal exercises). Sign matches assignVolume:
    // levelDelta = exerciseLevel − userDomainLevel (positive = harder).
    const computeWarmupLevel = (ex: Exercise): { programLevel: number; levelDelta: number; tier: TierName } => {
      const programLevel = resolveExerciseLevelForDomains(ex, resolvedChildDomains).level;
      const levelDelta = programLevel - getExDomainLevel(ex);
      return { programLevel, levelDelta, tier: resolveTier(levelDelta) };
    };

    // Collect movementGroups associated with each family from mainExercises
    // so we can build the base pool per family.
    const familyToMGs = new Map<string, Set<string>>();
    for (const we of mainExercises) {
      const ex = we.exercise;
      const rawId = ex.targetPrograms?.[0]?.programId ?? '';
      const slug  = (rawId ? resolveToSlug(rawId) : '') || rawId;
      const mg    = ex.movementGroup;
      const fId   = slug || MG_TO_BROAD_PATTERN[mg ?? ''] || 'other';
      if (mg) {
        let mgs = familyToMGs.get(fId);
        if (!mgs) { mgs = new Set(); familyToMGs.set(fId, mgs); }
        mgs.add(mg);
      }
    }

    // Family-first selection helper (F1–F4)
    const familyFirstPick = (
      candidates: Exercise[],
      familyId: string,
    ): { chosen: Exercise; tier: string } | null => {
      if (candidates.length === 0) return null;

      const familyPrograms = new Set<string>([familyId, resolveToSlug(familyId)].filter(Boolean) as string[]);
      const isSameFamily = (e: Exercise): boolean =>
        e.targetPrograms?.some(
          tp =>
            familyPrograms.has(tp.programId) ||
            familyPrograms.has(resolveToSlug(tp.programId) ?? ''),
        ) ?? false;

      const f1 = candidates.filter(e => isSameFamily(e) && e.exerciseRole === 'warmup');
      const f2 = candidates.filter(e => isSameFamily(e));
      const f3 = candidates.filter(e => e.exerciseRole === 'warmup');
      const pool = f1.length > 0 ? f1 : f2.length > 0 ? f2 : f3.length > 0 ? f3 : candidates;
      const tier = f1.length > 0 ? 'F1' : f2.length > 0 ? 'F2' : f3.length > 0 ? 'F3' : 'F4';
      const chosen = pickWithVariety(pool);
      return chosen ? { chosen, tier } : null;
    };

    // Candidate search: three-tier fallback for a given zone
    const findCandidates = (
      basePool: Exercise[],
      zone: { min: number; max: number },
      familyDomainLevel: number,
    ): Exercise[] => {
      // Tier 1: strict zone + contextual equipment
      let pool = basePool.filter(ex => {
        const lvl = getExDomainLevel(ex);
        const raw = ex.recommendedLevel ?? ex.targetPrograms?.[0]?.level ?? 0;
        const num = typeof raw === 'number' ? raw : 0;
        return num >= zone.min && num <= zone.max && num <= lvl && passesEquipmentAndLocation(ex);
      });

      if (pool.length === 0) {
        // Tier 2: relaxed zone (isPotentiationCandidate uses domainLevel-2 ceiling)
        pool = basePool.filter(ex =>
          isPotentiationCandidate(ex, familyDomainLevel) &&
          passesEquipmentAndLocation(ex),
        );
      }

      if (pool.length === 0) {
        // Tier 3: warmup-role exercises — location bypass
        pool = basePool.filter(ex =>
          ex.exerciseRole === 'warmup' &&
          (ex.execution_methods ?? ex.executionMethods ?? []).length > 0,
        );
      }

      return pool;
    };

    // Step 3: iterate families (legs-first for Mandatory Legs guarantee)
    const sortedFamilies = [...families].sort((a, b) => {
      const order = (f: FamilyWeight) => f.broadPattern === 'legs' ? 0 : f.broadPattern === 'pull' ? 1 : 2;
      return order(a) - order(b);
    });

    for (const family of sortedFamilies) {
      const mgs = familyToMGs.get(family.familyId) ?? new Set<string>();
      if (mgs.size === 0) continue;

      for (let slotIdx = 1; slotIdx <= family.slots; slotIdx++) {
        const si = slotIdx as 1 | 2 | 3 | 4;
        const zone = getSlotZone(family.domainLevel, si, family.slots);
        if (!zone) continue; // domain level too low for this slot

        // ── Cascading base-pool build ────────────────────────────────────────
        // Attempt 1 — Strict Pattern: match the exact movementGroups seen in
        // the main workout for this family (e.g. only 'hinge' exercises).
        const strictBasePool = allExercises.filter(ex =>
          !workoutIds.has(ex.id) && mgs.has(ex.movementGroup ?? ''),
        );

        let candidates = findCandidates(strictBasePool, zone, family.domainLevel);

        if (candidates.length === 0) {
          // Attempt 2 — Broad Domain Fallback: no exercise existed at the
          // required zone for the specific movementGroup (e.g. no Level-1 Hinge
          // in the DB).  Expand search to ANY exercise that belongs to the same
          // broad pattern (e.g. ANY 'legs' movement — squat, lunge, hinge) OR
          // shares a targetPrograms entry with this family's program slug.
          // This prevents the slot from collapsing entirely.
          const broadBasePool = allExercises.filter(ex => {
            if (workoutIds.has(ex.id)) return false;
            // Broad-pattern match (push / pull / legs)
            if (family.broadPattern !== 'other') {
              const exPattern = MG_TO_BROAD_PATTERN[ex.movementGroup ?? ''];
              if (exPattern === family.broadPattern) return true;
            }
            // Program/family slug match (handles skill tracks like muscle_up, planche)
            return ex.targetPrograms?.some(tp =>
              resolveToSlug(tp.programId) === family.familyId ||
              tp.programId === family.familyId,
            ) ?? false;
          });
          candidates = findCandidates(broadBasePool, zone, family.domainLevel);
          if (candidates.length > 0) {
            console.log(
              `[Warmup] Broad fallback fired for ${family.familyId} slot${slotIdx} ` +
              `(no strict-MG candidates at zone [${zone.min}–${zone.max}]) → ` +
              `${candidates.length} broad cands`,
            );
          }
        }

        if (candidates.length === 0) continue;

        const result = familyFirstPick(candidates, family.familyId);
        if (!result) continue;

        const { chosen, tier } = result;
        const repRange = getSlotReps(si, family.slots);
        // Label: last slot is Priming, all preceding slots are Activation
        const slotLabel = si === family.slots ? 'priming' : 'activation';
        addToBlock(chosen, `warmup: ${slotLabel} (${family.familyId}) slot${si}`, repRange, false, computeWarmupLevel(chosen));
        recordWarmupPick(chosen.id);
        if (family.broadPattern !== 'other') primedBroadPatterns.add(family.broadPattern);
        potentiationCount++;

        const chosenLevel = chosen.recommendedLevel ?? chosen.targetPrograms?.[0]?.level ?? '?';
        console.log(
          `[Warmup] ${slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1)} ${family.familyId} slot${si}/${family.slots} ${tier}: ` +
          `"${chosen.name?.he ?? chosen.id}" L${chosenLevel} from ${candidates.length} cands ` +
          `(zone [${zone.min}–${zone.max}], reps ${repRange.min}–${repRange.max})`,
        );

        // Suppress unused-variable lint warning for availableEquipment
        void availableEquipment;
      }
    }

    // ── Mandatory Legs Guarantee ──────────────────────────────────────────────
    // If the main workout has legs exercises but no legs warmup was generated
    // (e.g. all slots collapsed for the legs family), force a Slot-1 activation.
    if (activeBroadPatterns.has('legs') && !primedBroadPatterns.has('legs')) {
      const legsMGs = Array.from(LEGS_MGs);
      let forcedAdded = false;
      for (const mg of legsMGs) {
        if (forcedAdded) break;
        const basePool = allExercises.filter(ex => !workoutIds.has(ex.id) && ex.movementGroup === mg);
        // Mandatory Legs is always a single forced slot → use 1-slot scale (Direct Priming)
        const zone = getSlotZone(maxUserLevel, 1, 1) ?? { min: 1, max: 1 };
        const candidates = findCandidates(basePool, zone, maxUserLevel);
        const result = familyFirstPick(candidates, mg);
        if (result) {
          addToBlock(result.chosen, `warmup: activation (legs) [mandatory]`, ACTIVATION_REPS, false, computeWarmupLevel(result.chosen));
          recordWarmupPick(result.chosen.id);
          primedBroadPatterns.add('legs');
          potentiationCount++;
          forcedAdded = true;
          console.warn(
            `[Warmup] Mandatory Legs fired → "${result.chosen.name?.he ?? result.chosen.id}"`,
          );
        }
      }
    }

    if (potentiationCount > 0) {
      console.log(
        `[Warmup] Stage 2 Patterns primed: [${Array.from(primedBroadPatterns).join(', ')}] ` +
        `from active [${Array.from(activeBroadPatterns).join(', ')}] — ${potentiationCount} slots total`,
      );
    }
  }

  // Part C (domain regressions) intentionally removed — superseded by David Scale.

  // ── Time-aware trim (product decision 10.07.2026) ─────────────────────────
  // Warmup is part of the user's time budget. Trim the built ladder to the
  // session's slot budget, COVERAGE-FIRST: the first slot of each broad
  // family survives before extra ladder slots do (so a trimmed warmup still
  // touches every pattern the workout trains — incl. the Mandatory Legs slot,
  // which is its family's first). Runs AFTER the full build so all safety
  // guarantees above are inputs to the trim, never bypassed by it.
  const maxSlots = warmupSlotBudget(availableTimeMin);
  let finalBlock = warmupBlock;
  if (warmupBlock.length > maxSlots) {
    const familyOf = (we: WorkoutExercise): string =>
      MG_TO_BROAD_PATTERN[we.exercise.movementGroup ?? ''] ?? 'general';
    const seen = new Set<string>();
    const coverage: WorkoutExercise[] = [];
    const extras: WorkoutExercise[] = [];
    for (const we of warmupBlock) {
      const fam = familyOf(we);
      if (!seen.has(fam)) { seen.add(fam); coverage.push(we); }
      else extras.push(we);
    }
    const keep = new Set<WorkoutExercise>(coverage.slice(0, maxSlots));
    for (const we of extras) {
      if (keep.size >= maxSlots) break;
      keep.add(we);
    }
    finalBlock = warmupBlock.filter((we) => keep.has(we)); // original order preserved
    console.log(
      `[Warmup] Time-aware trim: ${warmupBlock.length} → ${finalBlock.length} slots ` +
      `(budget ${maxSlots} for ${availableTimeMin ?? '∞'}min, coverage-first)`,
    );
  }

  if (finalBlock.length > 0) {
    workout.exercises.unshift(...finalBlock);
    const generalCount = Math.min(1, finalBlock.length);
    console.log(
      `[Warmup] Block finalised: ${generalCount} general + ${potentiationCount} ladder slots ` +
      `= ${finalBlock.length} total (budget ${maxSlots})`,
    );
  }
}
