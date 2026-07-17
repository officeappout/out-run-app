/**
 * Workout Sorting Utilities
 *
 * Physiological exercise ordering, antagonist pairing, deduplication,
 * and equipment grouping. Extracted from WorkoutGenerator for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { exerciseMatchesProgram } from '../services/shadow-level.utils';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';
import type { WorkoutExercise } from './workout-generator.types';

// ============================================================================
// EQUIPMENT KEY
// ============================================================================

/**
 * Returns a canonical equipment key for antagonist pairing / sorting.
 * Normalized so that "Wide Pull-up Bar" and "Standard Pull-up Bar"
 * both return 'pullup_bar' and get grouped together.
 */
export function getEquipmentKey(ex: WorkoutExercise): string {
  const ids = [
    ...(ex.method?.gearIds ?? []),
    ...(ex.method?.equipmentIds ?? []),
  ].filter((id) => id && id !== 'bodyweight' && String(id).toLowerCase() !== 'bodyweight');
  if (ids.length === 0) return 'bodyweight';
  return normalizeGearId(ids[0]);
}

// ============================================================================
// PHYSIOLOGICAL SORT
// ============================================================================

/**
 * 5-tier physiological priority (lower = earlier in workout):
 *
 *   0 = Vertical Compounds   (vertical_pull / vertical_push / skill compunds:
 *                              muscle_up / planche / handstand_pushup / front_lever)
 *   1 = Horizontal Compounds (horizontal_pull / horizontal_push)
 *   2 = Legs                 (squat / hinge / lunge — uses exerciseMatchesProgram('legs'))
 *   3 = Isolation / Accessory (priority === 'isolation' | 'accessory', not legs/core)
 *   4 = Core / Abs           (must be last to preserve stabilizer availability)
 *
 * Stable within each tier: sorts DESCENDING by programLevel so higher-level
 * (neurologically more demanding) exercises always lead before lighter
 * companions in the same physiological category, then falls back to the
 * original index to preserve score-based ordering between same-level exercises.
 */
const VERTICAL_MOVEMENT_GROUPS = new Set(['vertical_pull', 'vertical_push']);
const HORIZONTAL_MOVEMENT_GROUPS = new Set(['horizontal_pull', 'horizontal_push']);
// Skill compound movement groups — treated as Tier 0 (vertical compound) for
// physiological ordering.  Muscle-ups, planche, and HSPU are the heaviest CNS
// demand exercises in the session and must precede volume work.
const SKILL_COMPOUND_MOVEMENT_GROUPS = new Set([
  'muscle_up',
  'planche',
  'handstand_pushup',
  'front_lever',
  'back_lever',
]);

export function applyPhysiologicalSort(
  exercises: WorkoutExercise[],
  options?: { femaleFullBody?: boolean },
): WorkoutExercise[] {
  const getDomainPriority = (ex: WorkoutExercise): number => {
    // Tier 4: Core — must come last
    if (exerciseMatchesProgram(ex.exercise, 'core')) return 4;

    // Tier 2 normally; Tier 0 for female full_body (legs are the primary compound)
    if (exerciseMatchesProgram(ex.exercise, 'legs')) return options?.femaleFullBody ? 0 : 2;

    const mg = ex.exercise.movementGroup ?? '';

    // Tier 0: Skill compound movements — neurologically the heaviest,
    // must always precede volume work for CNS priming.
    if (SKILL_COMPOUND_MOVEMENT_GROUPS.has(mg as string)) return 0;

    // Tier 0: Vertical compounds (pull-ups, overhead press, handstand)
    if (VERTICAL_MOVEMENT_GROUPS.has(mg)) return 0;

    // Tier 1: Horizontal compounds (rows, bench-style push)
    if (HORIZONTAL_MOVEMENT_GROUPS.has(mg)) return 1;

    // Tier 3: Isolation / Accessory (arms, shoulders, single-joint)
    if (ex.priority === 'isolation' || ex.priority === 'accessory') return 3;

    // Default: treat untagged as vertical compound (placed first)
    return 0;
  };

  const indexed = exercises.map((ex, i) => ({
    ex,
    i,
    domainPri: getDomainPriority(ex),
  }));

  indexed.sort((a, b) => {
    const roleOrder: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 };
    const roleA = roleOrder[a.ex.exerciseRole ?? 'main'] ?? 1;
    const roleB = roleOrder[b.ex.exerciseRole ?? 'main'] ?? 1;
    if (roleA !== roleB) return roleA - roleB;

    if (a.domainPri !== b.domainPri) return a.domainPri - b.domainPri;

    // Within the same tier: sort DESCENDING by programLevel so the most
    // neurologically demanding exercise (highest level) leads.  This ensures
    // L19 Kipping Muscle-ups are never pushed below L16 Pull-ups in the
    // same Tier-0 bucket, regardless of score order.
    const levelA = a.ex.programLevel ?? 0;
    const levelB = b.ex.programLevel ?? 0;
    if (levelA !== levelB) return levelB - levelA; // higher level first

    return a.i - b.i;
  });

  return indexed.map((item) => item.ex);
}

// ============================================================================
// STRICT DOMAIN-PRIORITY SORT (final pass)
// ============================================================================

/**
 * Domain-priority weights for the absolute-final sort pass.
 *   1 → upper-body compounds + skills (push / pull / muscle_up / HSPU / planche)
 *   2 → legs (squat / hinge / lunge)
 *   3 → core, isolation, accessory
 *
 * Designed to be the LAST mutation of the exercise array in the pipeline —
 * runs after VolumeGuard pruning and after antagonist-pairing re-runs so
 * upper-compound work always leads the session regardless of which
 * pre-stages reshuffled things.
 */
const DOMAIN_PRIORITY_WEIGHTS: Record<string, number> = {
  // Upper compounds + skills (weight 1)
  vertical_push:    1, horizontal_push: 1,
  vertical_pull:    1, horizontal_pull: 1,
  muscle_up:        1,
  handstand_pushup: 1,
  planche:          1,
  // Legs (weight 2)
  squat: 2, hinge: 2, lunge: 2,
  // Core + isolation (weight 3)
  core:           3, anti_extension: 3, anti_rotation: 3,
  isolation:      3, accessory:      3,
};

function resolveDomainWeight(we: WorkoutExercise): number {
  const mg = we.exercise.movementGroup ?? '';
  const byMg = DOMAIN_PRIORITY_WEIGHTS[mg];
  if (typeof byMg === 'number') return byMg;
  const pri = we.priority;
  if (pri === 'isolation' || pri === 'accessory') return 3;
  if (pri === 'skill') return 1;
  return 1;
}

/**
 * Tier sub-order within a domain-weight bucket.
 *
 * Elite/Hard skill work MUST always precede compound strength which MUST
 * always precede flow/accessory movements — independently of what order
 * upstream passes (antagonist-pairing, VolumeGuard, warmup injection) left
 * things in.  Pyramid exercises carry `exerciseRole === 'main'` and a high
 * array index (they're appended last by `applyAntagonistPairing`), so without
 * this sub-sort they'd trail dips and pull-ups in the final render.
 *
 * Priority table:
 *   0 — elite        (maximum CNS demand — e.g. Planche hold L19)
 *   1 — hard         (near-max — e.g. One-arm negatives)
 *   2 — skill / compound  (structural prime movers)
 *   3 — foundation   (baseline compound — Pull-up, Dip, Push-up)
 *   4 — match        (volume work at user level)
 *   5 — flow / easy / accessory / isolation
 */
export function resolveTierSubOrder(we: WorkoutExercise): number {
  if (we.tier === 'elite')                                    return 0;
  if (we.tier === 'hard')                                     return 1;
  if (we.priority === 'skill' || we.priority === 'compound')  return 2;
  if (we.priority === 'foundation')                           return 3;
  if (we.tier === 'match')                                    return 4;
  return 5; // flow / easy / accessory / isolation
}

/**
 * Strict domain-priority sort.  Within each domain-weight bucket the order is:
 *   1. Tier sub-order  (elite → hard → skill/compound → foundation → match → flow)
 *   2. programLevel descending  (higher level = heavier CNS demand comes first)
 *   3. Original index  (stable fallback — preserves pairing adjacency)
 *
 * Honours `exerciseRole` boundaries (warmup → main → cooldown).
 *
 * IMPORTANT: must be the FINAL array mutation in the workout pipeline.
 * Anything that reorders or splices the array after this point will break
 * the CNS/energy management contract.
 */
export function applyDomainPrioritySort(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const roleOrder: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 };
  return exercises
    .map((we, i) => ({
      we,
      i,
      weight: resolveDomainWeight(we),
      tierSub: resolveTierSubOrder(we),
      // Supreme Protocol Gate flag — pyramid exercises must always lead
      // the main block to land the neurological overload set on a fresh CNS.
      isPyramid: isPyramidExercise(we),
    }))
    .sort((a, b) => {
      const ra = roleOrder[a.we.exerciseRole ?? 'main'] ?? 1;
      const rb = roleOrder[b.we.exerciseRole ?? 'main'] ?? 1;
      if (ra !== rb) return ra - rb;

      // ── GENERAL-WARMUP PIN — Stage-1 mobility drill leads the warmup block ──
      // Fires only within the warmup role bucket (both sides warmup). The
      // Stage-1 general mobility warmup is stamped `isGeneralWarmup` by
      // `prependWarmupExercises`; without this pin the domain-weight sort below
      // buries it beneath the pattern/ladder potentiation slots (real push/pull/
      // legs exercises carry lower domain weights than a mobility=weight-3 drill).
      // Ordering: warmup → [general warmup] → [ladder slots] → main → cooldown.
      // Does NOT reorder anything else — the ladder slots keep their existing sort.
      const ga = a.we.isGeneralWarmup === true;
      const gb = b.we.isGeneralWarmup === true;
      if (ga !== gb) return ga ? -1 : 1;

      // ── SUPREME PROTOCOL GATE — pyramid absolute precedence ─────────────
      // Within the main block, an exercise stamped with a pyramid protocol
      // (`pyramidSequence` or `repsSequence` populated by the
      // PyramidProcessor — captured here as `isPyramid`) MUST occupy the
      // top of the block.  Pyramid sets carry the heaviest CNS demand of
      // the session — D3 ramps to a +2 peak overload, D2 builds to a
      // hypertrophy apex — and the user must arrive at them with a fresh
      // nervous system.  Burying a pyramid below straight-set foundation
      // work would force the peak set on already-fatigued tissue and
      // violate the physiological intent of the protocol.
      //
      // Implemented as a Supreme Gate that fires AFTER the role boundary
      // (so pyramids never displace warmup) but BEFORE every other key
      // (domain weight, tier sub-order, level), so the ranking is:
      //   warmup → [pyramid mains] → [non-pyramid mains by tier/level] → cooldown.
      if (a.isPyramid !== b.isPyramid) return a.isPyramid ? -1 : 1;

      // Primary: domain weight (upper=1, legs=2, core/iso=3)
      if (a.weight !== b.weight) return a.weight - b.weight;

      // Secondary: TIER-EQUALITY GATE.
      // When two exercises share the EXACT same `tier` value (e.g. both
      // `flow`, both `match`, both `elite`), order them by programLevel
      // descending FIRST so the highest-CNS-demand exercise leads
      // regardless of `priority` classification.  This prevents an L19
      // skill exposure (tier=flow, priority=skill/undefined → tierSub=2 or 5)
      // from being buried below an L15 foundation (tier=flow, priority=foundation
      // → tierSub=3) just because foundation outranks skill in the categorical
      // sub-order — within a shared tier the level itself is the truer
      // physiological intensity signal.
      const sameTier = a.we.tier === b.we.tier;
      const la = a.we.programLevel ?? 0;
      const lb = b.we.programLevel ?? 0;
      if (sameTier && la !== lb) return lb - la;

      // Tertiary: tier sub-order (elite → hard → skill/compound → foundation → match → flow)
      // Reached when tiers DIFFER, or share the same tier but identical levels.
      if (a.tierSub !== b.tierSub) return a.tierSub - b.tierSub;

      // Quaternary: programLevel descending (heavier CNS load leads).
      // Catches the cross-tier case where tier values differ but tierSub
      // collapsed to the same bucket (e.g. tier=match vs tier=flow with
      // priority=accessory both mapping to tierSub=4/5).
      if (la !== lb) return lb - la;

      // Quinary: stable index (preserves antagonist-pair adjacency)
      return a.i - b.i;
    })
    .map((entry) => entry.we);
}

// ============================================================================
// ANTAGONIST PAIRING
// ============================================================================

/**
 * Returns true when the exercise carries pyramid-protocol data
 * (`pyramidSequence` for Mechanical, `repsSequence` for Repetition).
 * Pyramid blocks must always render as single standalone sections so
 * the per-step variant UI is not hijacked by the generic superset
 * container — the engine therefore insulates these exercises from any
 * antagonist pairing pass.
 */
function isPyramidExercise(ex: WorkoutExercise): boolean {
  return (
    (Array.isArray(ex.pyramidSequence) && ex.pyramidSequence.length > 0) ||
    (Array.isArray(ex.repsSequence) && ex.repsSequence.length > 0)
  );
}

export function applyAntagonistPairing(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const legs: WorkoutExercise[] = [];
  const pull: WorkoutExercise[] = [];
  const push: WorkoutExercise[] = [];
  const warmupCooldown: WorkoutExercise[] = [];
  // "other" = core, isolation, unclassified — eligible for fallback pairing
  const other: WorkoutExercise[] = [];
  // Pyramid exercises bypass pairing entirely — they keep their original
  // ordering and have `pairedWith` cleared defensively.
  const pyramids: WorkoutExercise[] = [];

  const getName = (ex: WorkoutExercise) =>
    typeof ex.exercise.name === 'string'
      ? ex.exercise.name
      : (ex.exercise.name as any)?.he ?? (ex.exercise.name as any)?.en ?? ex.exercise.id;

  for (const ex of exercises) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') {
      warmupCooldown.push(ex);
      continue;
    }
    if (isPyramidExercise(ex)) {
      pyramids.push({ ...ex, pairedWith: undefined });
      continue;
    }
    const mg = ex.exercise.movementGroup ?? '';
    // Cast to string so TypeScript allows comparison with skill movement groups
    // ('muscle_up', 'front_lever', etc.) that exist in Firestore data but are
    // not in the MovementGroup union type (type predates admin skill groups).
    const mgStr = mg as string;
    // Skill compound classification: muscle_up / front_lever / back_lever are
    // biomechanically pull patterns; planche / handstand_pushup are push.
    // Without this, they fall into 'other' and get interleaved AFTER the pull/push
    // exercises they should precede, breaking the CNS hierarchy.
    const isSkillPull = mgStr === 'muscle_up' || mgStr === 'front_lever' || mgStr === 'back_lever';
    const isSkillPush = mgStr === 'planche' || mgStr === 'handstand_pushup';

    // ── Data-gap safety-net: targetPrograms tag fallback ──────────────────
    // Fires ONLY when movementGroup is absent or empty ('') — catches exercises
    // whose Firestore document predates the skill movementGroup schema but are
    // correctly tagged in targetPrograms.  Prevents them from silently landing
    // in `other` and breaking antagonist pair formation.
    const PUSH_SKILL_PROG_IDS = new Set(['planche', 'handstand_pushup', 'handstand']);
    const PULL_SKILL_PROG_IDS = new Set(['front_lever', 'muscle_up', 'back_lever', 'one_arm_pullup']);
    let isSkillPushByTag = false;
    let isSkillPullByTag = false;
    if (mgStr === '') {
      for (const tp of (ex.exercise.targetPrograms ?? [])) {
        if (PUSH_SKILL_PROG_IDS.has(tp.programId)) { isSkillPushByTag = true; break; }
        if (PULL_SKILL_PROG_IDS.has(tp.programId)) { isSkillPullByTag = true; break; }
      }
    }

    if (isSkillPush || isSkillPushByTag || exerciseMatchesProgram(ex.exercise, 'push')) push.push(ex);
    else if (isSkillPull || isSkillPullByTag || exerciseMatchesProgram(ex.exercise, 'pull')) pull.push(ex);
    else if (exerciseMatchesProgram(ex.exercise, 'legs')) legs.push(ex);
    else other.push(ex);
  }

  // Sort pull and push buckets DESCENDING by programLevel so the highest-level
  // exercise in each domain leads the bucket — this ensures the most demanding
  // exercise always appears first in pairs (e.g. L19 Kipping Muscle-up before
  // L16 Pull-up), preserving CNS demand hierarchy across the whole session.
  const byLevelDesc = (a: WorkoutExercise, b: WorkoutExercise): number => {
    const la = a.programLevel ?? 0;
    const lb = b.programLevel ?? 0;
    return lb - la;
  };
  pull.sort(byLevelDesc);
  push.sort(byLevelDesc);

  // ── Quad + Hamstring leg pairs ─────────────────────────────────────────
  const legsQuad: WorkoutExercise[] = [];
  const legsHamstring: WorkoutExercise[] = [];
  for (const ex of legs) {
    const muscle = ex.exercise.primaryMuscle;
    if (muscle === 'hamstrings' || muscle === 'glutes') legsHamstring.push(ex);
    else legsQuad.push(ex);
  }
  legsQuad.sort((a, b) => getEquipmentKey(a).localeCompare(getEquipmentKey(b)));
  legsHamstring.sort((a, b) => getEquipmentKey(a).localeCompare(getEquipmentKey(b)));
  const legPairs: WorkoutExercise[] = [];
  const legPairCount = Math.min(legsQuad.length, legsHamstring.length);
  for (let i = 0; i < legPairCount; i++) {
    legPairs.push(
      { ...legsQuad[i], pairedWith: legsHamstring[i].exercise.id },
      { ...legsHamstring[i], pairedWith: legsQuad[i].exercise.id },
    );
  }
  for (let i = legPairCount; i < legsQuad.length; i++) legPairs.push(legsQuad[i]);
  for (let i = legPairCount; i < legsHamstring.length; i++) legPairs.push(legsHamstring[i]);

  // ── Push + Pull pairs ──────────────────────────────────────────────────
  const pushPullPairs: WorkoutExercise[] = [];
  const pullUsed = new Set<number>();
  const pushUsed = new Set<number>();
  const pairCount = Math.min(pull.length, push.length);

  for (let round = 0; round < pairCount; round++) {
    let bestPullIdx = -1;
    let bestPushIdx = -1;
    let bestScore = -1;

    for (let pi = 0; pi < pull.length; pi++) {
      if (pullUsed.has(pi)) continue;
      for (let pj = 0; pj < push.length; pj++) {
        if (pushUsed.has(pj)) continue;
        const score = getEquipmentKey(pull[pi]) === getEquipmentKey(push[pj]) ? 1 : 0;
        if (score > bestScore) {
          bestScore = score;
          bestPullIdx = pi;
          bestPushIdx = pj;
        }
      }
    }

    if (bestPullIdx >= 0 && bestPushIdx >= 0) {
      pullUsed.add(bestPullIdx);
      pushUsed.add(bestPushIdx);
      pushPullPairs.push(
        { ...pull[bestPullIdx], pairedWith: push[bestPushIdx].exercise.id },
        { ...push[bestPushIdx], pairedWith: pull[bestPullIdx].exercise.id },
      );
    }
  }
  const unparedPull: WorkoutExercise[] = pull.filter((_, i) => !pullUsed.has(i));
  const unparedPush: WorkoutExercise[] = push.filter((_, i) => !pushUsed.has(i));

  // ── Fallback: single-domain session (Push-only OR Pull-only) ─────────────
  // When push+pull pairing yielded 0 pairs, try pairing the lone domain with
  // core / isolation exercises from `other`.  Push+Core and Pull+Core supersets
  // are physiologically valid — the prime mover rests while core is active.
  const fallbackPairs: WorkoutExercise[] = [];
  const otherUsed = new Set<number>();

  const singleDomain = pairCount === 0 ? (
    unparedPush.length > 0 && unparedPull.length === 0 ? unparedPush :
    unparedPull.length > 0 && unparedPush.length === 0 ? unparedPull :
    null
  ) : null;

  let fallbackCount = 0;
  if (singleDomain && other.length > 0) {
    const domainLabel = unparedPush.length > 0 ? 'push' : 'pull';
    for (let di = 0; di < singleDomain.length; di++) {
      const oi = other.findIndex((_, idx) => !otherUsed.has(idx));
      if (oi === -1) {
        // No more core exercises — append remaining domain exercise unpaired
        fallbackPairs.push(singleDomain[di]);
        continue;
      }
      otherUsed.add(oi);
      fallbackPairs.push(
        { ...singleDomain[di], pairedWith: other[oi].exercise.id },
        { ...other[oi], pairedWith: singleDomain[di].exercise.id },
      );
      fallbackCount++;
    }
    // Append any remaining core/isolation exercises that didn't get paired
    for (let oi = 0; oi < other.length; oi++) {
      if (!otherUsed.has(oi)) fallbackPairs.push(other[oi]);
    }
    console.log(
      `[WorkoutGenerator] Antagonist fallback: ${fallbackCount} ${domainLabel}+core pairs ` +
      `(no opposing domain — used core/isolation as antagonist)`,
    );
  } else {
    // No opposing domain AND no core/isolation exercises available for pairing.
    // Route remaining exercises to the correct result accumulator so they are
    // never silently dropped:
    //   singleDomain active → use fallbackPairs (picked up by the singleDomain
    //                          result branch below — pushPullPairs is ignored
    //                          in that branch, so anything added there is lost)
    //   multi-domain        → use pushPullPairs (standard straight-set path)
    const remaining = [...unparedPull, ...unparedPush, ...other];
    if (singleDomain) {
      // No push↔pull pairs AND no core to pair with (e.g. Path-C skill-only
      // user with only planche exercises). Treat everything as straight sets.
      for (const ex of remaining) fallbackPairs.push(ex);
      console.log(
        `[WorkoutGenerator] Antagonist pairing: singleDomain with 0 core exercises — ` +
        `${remaining.length} exercise(s) passed through as straight sets.`,
      );
    } else {
      for (const ex of remaining) pushPullPairs.push(ex);
    }
  }

  const totalPairs = pairCount + legPairCount + fallbackCount;
  if (totalPairs > 0) {
    console.log(
      `[WorkoutGenerator] Antagonist pairing complete: ` +
      `${pairCount} push+pull, ${legPairCount} quad+hamstring, ${fallbackCount} domain+core fallback`,
    );
  } else {
    console.log(
      `[WorkoutGenerator] ⚠️  Antagonist pairing: 0 pairs formed. ` +
      `push=${push.length}, pull=${pull.length}, legs=${legs.length}, other=${other.length}. ` +
      `pyramids=${pyramids.length}, warmupCooldown=${warmupCooldown.length}. ` +
      `Likely cause: ${push.length === 0 && pull.length === 0 ? 'no upper-body exercises in pool (check domain filter / pool rescue)' : push.length === 0 ? 'pull-only pool — push side missing (check calisthenics_upper additionalSlugs or exercise tagging)' : pull.length === 0 ? 'push-only pool — pull side missing (check calisthenics_upper additionalSlugs or exercise tagging)' : 'quad/ham split with no opposing upper domain'}. ` +
      `All exercises will show as straight sets (pairedWith=none).`,
    );
  }

  // Build result — always use singleDomain path when that branch ran so we
  // don't accidentally include pushPullPairs (which contains the same
  // exercises) alongside fallbackPairs.
  // Pyramid blocks are appended AFTER pairs so they keep their independent
  // section in the playlist while paired blocks render first.
  const result = singleDomain
    ? [...legPairs, ...fallbackPairs, ...pyramids, ...warmupCooldown]
    : [...legPairs, ...pushPullPairs, ...other, ...pyramids, ...warmupCooldown];

  // ── DEBUG: show every exercise and its pairedWith so we can verify the chain ──
  console.log(
    `[applyAntagonistPairing] Buckets — push:${push.length} pull:${pull.length} ` +
    `legs:${legs.length} other:${other.length} pyramids:${pyramids.length} ` +
    `warmupCooldown:${warmupCooldown.length}`,
  );
  for (const ex of result) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
    console.log(
      `  [Pair] "${getName(ex)}" (id=${ex.exercise.id}) → pairedWith=${ex.pairedWith ?? 'NONE'}`,
    );
  }

  return result;
}

// ============================================================================
// ORPHAN PAIR CLEANUP
// ============================================================================

/**
 * After VolumeGuard prunes exercises, any `pairedWith` reference that
 * targets a now-missing exercise becomes a "dangling pair" — the runner
 * will keep advancing to a partner that no longer exists, and the
 * sub-grouping logic in the playlist breaks the domain sort math.
 *
 * Call this immediately after each removal so `pairedWith` on the
 * surviving exercises is always either:
 *   • a valid id pointing at another exercise still in the list, or
 *   • undefined (cleared)
 *
 * MUTATES the array entries' `pairedWith` field in-place.
 */
export function clearOrphanedPairings(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const liveIds = new Set(exercises.map((e) => e.exercise.id));
  let cleared = 0;
  for (const ex of exercises) {
    if (ex.pairedWith && !liveIds.has(ex.pairedWith)) {
      console.log(
        `[OrphanCleanup] "${(ex.exercise.name as any)?.he ?? ex.exercise.id}" — ` +
        `pairedWith="${ex.pairedWith}" no longer in list, clearing.`,
      );
      ex.pairedWith = undefined;
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`[OrphanCleanup] Cleared ${cleared} dangling pairedWith reference(s)`);
  }
  return exercises;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

export function deduplicateExercises(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const seen = new Set<string>();
  return exercises.filter((ex) => {
    const id = ex.exercise.id;
    if (seen.has(id)) {
      console.warn(`[WorkoutGenerator] Duplicate exercise removed: ${id}`);
      return false;
    }
    seen.add(id);
    return true;
  });
}
