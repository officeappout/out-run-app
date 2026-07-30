/**
 * BudgetDistributor — Isolated Volume Math Module
 *
 * Responsible for a single, well-defined transformation:
 *
 *   ScoredExercise[]  →  WorkoutExercise[]  (with sets / reps / rest stamped)
 *
 * Migrated from WorkoutGenerator.ts Steps 4–5g and applySmartSetCap chains.
 * All budget arithmetic lives here; no UI code, no Firestore reads.
 *
 * Safety Contracts
 * ────────────────
 * 1. Empty-list guard  – returns [] immediately when exercises.length === 0,
 *    preventing downstream NaN / Infinity from set division.
 * 2. safeDenominator   – always Math.max(1, rawDenominator) before every call
 *    to applySmartSetCap, preventing cap / 0 = Infinity.
 * 3. setsPerSlot ceiling – already enforced inside assignVolume via
 *    context.dailySetBudget ÷ exerciseCount (Stage 3A); BudgetDistributor
 *    additionally verifies the pre/post cap totals to ensure the budget is
 *    respected end-to-end.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { ScoredExercise } from '../../logic/contextual-engine.types';
import type {
  DifficultyLevel,
  TierName,
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { TIER_TABLE } from '../../logic/workout-generator.types';
import {
  assignVolume,
  applySmartSetCap,
  calculateVolumeAdjustment,
} from '../../logic/workout-budgeting.utils';
import { resolveTierSubOrder } from '../../logic/workout-sorting.utils';
import { MG_TO_DOMAIN } from '../../shared/constants/domain-mapping.constants';
import type { BudgetConstraints } from './pipeline.types';

// ============================================================================
// TIER MAX SETS TABLE
// ────────────────────────────────────────────────────────────────────────────
// Single source of truth — derived directly from the canonical TIER_TABLE
// in workout-generator.types.ts.  Adding a new tier or changing a tier's
// `sets.max` automatically propagates here without any hand-edit.
// ============================================================================

const TIER_MAX_SETS: Record<TierName, number> = (Object.keys(TIER_TABLE) as TierName[])
  .reduce((acc, tier) => {
    acc[tier] = TIER_TABLE[tier].sets.max;
    return acc;
  }, {} as Record<TierName, number>);

// Skill / Strength Cluster — when difficulty=3 collapses a thin-spread plan
// onto a small set of high-quality exercises, we cap the unique main count
// and stack remaining sets onto each survivor up to this ceiling.
const SKILL_CLUSTER_MAX_MAIN = 4;
const SKILL_CLUSTER_MAX_SETS = 5;

// Balanced Cluster — when difficulty=2 produces too many shallow exercises
// (the "11 sets ÷ 7 exercises = 2-set fragments" bug), cull the unique main
// count to a tight focused block and stack remaining sets onto the survivors
// up to a hypertrophy-appropriate ceiling.  Unlike the D3 cluster, the D2
// ceiling is 4 sets/exercise (not 5) — balanced sessions consolidate volume
// without pushing into peak-overload territory.
//
//  • Baseline cap     — 3 main exercises (deep-focus block)
//  • Diverse cap      — 4 main exercises (when ≥3 distinct logical domains
//                        are present, the session is genuinely full-body
//                        and warrants the extra slot for breadth)
const BALANCED_CLUSTER_MAX_MAIN_BASELINE = 3;
const BALANCED_CLUSTER_MAX_MAIN_DIVERSE  = 4;
const BALANCED_CLUSTER_MAX_SETS          = 4;
const BALANCED_DIVERSITY_THRESHOLD       = 3; // distinct domains needed to unlock the diverse cap

// ============================================================================
// RESULT TYPE
// ============================================================================

export interface BudgetDistributorResult {
  exercises: WorkoutExercise[];
  /** Total planned sets after all caps and rebalancing */
  totalSets: number;
  /** True when the set-rebalance pass fired and added ≥ 1 set */
  rebalanceFired: boolean;
  /** Set count that was added by the rebalance pass (0 if !rebalanceFired) */
  rebalancedSets: number;
  /** Diagnostic log entries for the workout pipeline log */
  log: string[];
}

// ============================================================================
// BUDGET DISTRIBUTOR
// ============================================================================

export class BudgetDistributor {
  /**
   * Core entry point.
   *
   * @param scoredExercises  Score-ranked list from PoolFactory (main slots only)
   * @param context          Full generation context (levels, budget, flags)
   * @param difficulty       1 | 2 | 3 (easy / medium / hard)
   * @param constraints      Distilled budget parameters from StructureDirector
   */
  distribute(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
    constraints: BudgetConstraints,
  ): BudgetDistributorResult {
    const log: string[] = [];

    // ── Guard 1: empty list ──────────────────────────────────────────────────
    if (scoredExercises.length === 0) {
      log.push('budget_distributor: no exercises — returning empty list');
      return { exercises: [], totalSets: 0, rebalanceFired: false, rebalancedSets: 0, log };
    }

    // ── Step 1: Volume assignment ────────────────────────────────────────────
    // assignVolume internally computes setsPerSlot from context.dailySetBudget
    // when available (Stage 3A ceiling). VolumeAdjustment carries periodization
    // / inactivity multipliers.
    const volumeAdjustment = calculateVolumeAdjustment(context, difficulty);
    let exercises = assignVolume(
      scoredExercises as (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
      context,
      volumeAdjustment,
      difficulty,
    );
    log.push(`volume_assigned: ${exercises.length} exercises, adj_sets=${volumeAdjustment.adjustedSets}`);

    // ── Step 1b: Pyramid set-count lock ──────────────────────────────────────
    // `pyramidSequence` is the ground truth for pyramid exercises — every
    // array element is one required protocol step.  We lock `sets` to the
    // sequence length HERE, before any cap pass runs, so no budget arithmetic
    // can ever trim a 3-step pyramid down to 2 sets.
    //
    // We rely EXCLUSIVELY on the structural array (`pyramidSequence.length`),
    // NOT on the `appliedProtocol` string, which may not yet be injected at
    // this stage of the generation pipeline.
    let pyramidsPinned = 0;
    for (const ex of exercises) {
      if (ex.pyramidSequence && ex.pyramidSequence.length > 0) {
        const correct = ex.pyramidSequence.length;
        if (ex.sets !== correct) {
          const was = ex.sets;
          ex.sets = correct;
          ex.reasoning.push(`pyramid_pin:sets_locked=${correct}(was=${was})`);
          pyramidsPinned++;
        }
      }
    }
    if (pyramidsPinned > 0) {
      log.push(`pyramid_pin: locked ${pyramidsPinned} pyramid exercise(s) to sequence length`);
    }

    // ── Step 2: Compute safe denominator ────────────────────────────────────
    // For single-domain sessions (Push-only, Pull-only, Legs-only) the domain
    // count is 1, which would make applySmartSetCap spread the cap over 1 slot
    // and yield Infinity for per-exercise targets.
    // We use the ACTUAL exercise count as the denominator in that case so the
    // cap is evenly distributed across all slots instead of collapsing to 1.
    const rawDenominator = constraints.isSingleDomain
      ? exercises.length
      : Math.max(1, constraints.exerciseSlotCount);
    const safeDenominator = Math.max(1, rawDenominator);
    log.push(`safe_denominator: ${safeDenominator} (isSingleDomain=${constraints.isSingleDomain})`);

    // ③ item 5 (structure floor): normal workouts never thin below 2 sets/exercise — the caps
    // DROP the lowest-score exercises rather than shrink survivors to 1 set. Skip 5-min (≤10) +
    // blast/AMRAP (floor 1), where a single set is legitimate.
    const structureFloor = context.availableTime > 10 && context.intentMode !== 'blast' ? 2 : 1;

    // ── Step 3: Hard absolute cap (context.maxSets) ──────────────────────────
    // Pyramid exercises are immune — only straight-set exercises are trimmed.
    if (constraints.maxSets != null && constraints.maxSets > 0) {
      const before = exercises.reduce((s, e) => s + e.sets, 0);
      exercises = this._pyramidAwareCap(exercises, constraints.maxSets, safeDenominator, structureFloor);
      const after = exercises.reduce((s, e) => s + e.sets, 0);
      if (after < before) {
        log.push(`max_sets_cap: ${before} → ${after} (cap=${constraints.maxSets})`);
      }
    }

    // ── Step 4: Weekly budget cap ────────────────────────────────────────────
    if (constraints.remainingWeeklyBudget != null && constraints.remainingWeeklyBudget > 0) {
      const before = exercises.reduce((s, e) => s + e.sets, 0);
      exercises = this._pyramidAwareCap(exercises, constraints.remainingWeeklyBudget, safeDenominator, structureFloor);
      const after = exercises.reduce((s, e) => s + e.sets, 0);
      if (after < before) {
        log.push(`weekly_budget_cap: ${before} → ${after} (remaining=${constraints.remainingWeeklyBudget})`);
      }
    }

    // ── Step 5: Daily set budget cap ─────────────────────────────────────────
    if (constraints.dailySetBudget != null && constraints.dailySetBudget > 0) {
      const preCap = exercises.reduce((s, e) => s + e.sets, 0);
      if (preCap > constraints.dailySetBudget) {
        exercises = this._pyramidAwareCap(exercises, constraints.dailySetBudget, safeDenominator, structureFloor);
        const postCap = exercises.reduce((s, e) => s + e.sets, 0);
        log.push(`daily_budget_cap: ${preCap} → ${postCap} (budget=${constraints.dailySetBudget})`);
      }
    }

    // ── Step 5g: Set Re-Balancing ────────────────────────────────────────────
    // If the daily budget allows more sets than are currently planned, fill the
    // gap by stacking sets on elite/hard exercises instead of adding low-quality
    // movements. This concentrates volume on the most demanding exercises.
    const { rebalanceFired, rebalancedSets } = this._rebalanceSets(exercises, constraints, log);

    // ── Step 5h: Skill / Strength Cluster Cap (D3 only) ──────────────────────
    // When difficulty=3 + skill-or-strength session, cull thin-spread main
    // exercises down to SKILL_CLUSTER_MAX_MAIN and concentrate any freed
    // budget on the surviving high-tier movements (elite → hard → … ).
    // Migrated from WorkoutGenerator Step 5h.
    exercises = this._skillClusterCap(exercises, context, difficulty, constraints, log);

    // ── Step 5i: Balanced Cluster Cap (D2 only) ──────────────────────────────
    // Symmetric to the D3 skill cluster cap — for D2 (Balanced) sessions, cap
    // the main block at 3 exercises (or 4 when ≥3 distinct domains present).
    // Prevents the live "7 exercises × 2 sets" fragmentation bug by clustering
    // the daily set budget into 3-4-set hypertrophy blocks.
    exercises = this._balancedClusterCap(exercises, difficulty, constraints, log);

    const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
    log.push(`distributor_complete: totalSets=${totalSets}`);

    return { exercises, totalSets, rebalanceFired, rebalancedSets, log };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Attempts to fill any gap between the current planned sets and the daily
   * set budget by adding sets to elite → hard → match exercises (in that
   * priority order) up to each tier's maximum.
   *
   * Mutates the `exercises` array in place (same behaviour as the original
   * Step 5g in WorkoutGenerator.ts) and appends audit entries to `log`.
   */
  private _rebalanceSets(
    exercises: WorkoutExercise[],
    constraints: BudgetConstraints,
    log: string[],
  ): { rebalanceFired: boolean; rebalancedSets: number } {
    if (constraints.dailySetBudget == null) {
      return { rebalanceFired: false, rebalancedSets: 0 };
    }

    const currentPlannedSets = exercises.reduce((s, e) => s + e.sets, 0);
    const remainingBudget = constraints.dailySetBudget - currentPlannedSets;
    if (remainingBudget <= 0) {
      return { rebalanceFired: false, rebalancedSets: 0 };
    }

    // Only refill main-role exercises at quality tiers
    const fillCandidates = exercises
      .filter(e => {
        if (e.exerciseRole !== 'main') return false;
        const tierMax = TIER_MAX_SETS[e.tier ?? 'match'] ?? 4;
        return (
          e.sets < tierMax &&
          (e.tier === 'elite' || e.tier === 'hard' || e.tier === 'match')
        );
      })
      .sort((a, b) => {
        const tierPriority = (t: string | undefined): number =>
          t === 'elite' ? 0 : t === 'hard' ? 1 : 2;
        return tierPriority(a.tier) - tierPriority(b.tier);
      });

    let setsAdded = 0;
    for (const ex of fillCandidates) {
      if (setsAdded >= remainingBudget) break;
      const tierMax = TIER_MAX_SETS[ex.tier ?? 'match'] ?? 4;
      if (ex.sets < tierMax) {
        ex.sets += 1;
        ex.reasoning.push(
          `set_rebalance:+1(tier=${ex.tier},budget_remaining=${remainingBudget - setsAdded})`,
        );
        setsAdded++;
      }
    }

    if (setsAdded > 0) {
      log.push(`set_rebalance: +${setsAdded} set(s) redistributed to quality exercises`);
    }

    return { rebalanceFired: setsAdded > 0, rebalancedSets: setsAdded };
  }

  /**
   * Pyramid-aware set cap.
   *
   * Pyramid exercises (`pyramidSequence` present OR `appliedProtocol === 'pyramid'`)
   * are completely immune to set reductions — their step count is fixed by
   * protocol design and must not be truncated.
   *
   * When the total planned sets exceed `cap`, the excess is removed by
   * targeting straight-set exercises in DESCENDING set count order (the
   * candidate with the most sets loses one set per iteration) until the
   * budget is satisfied.  If pyramid sets alone already exceed the cap,
   * the cap is left unenforceable (pyramids cannot be cut) and the
   * remaining straight-set exercises receive 1 set each as a floor.
   *
   * Falls back to `applySmartSetCap` (uniform distribution) only for the
   * non-pyramid portion when the greedy decrement can't reach the target
   * (should not occur in practice given the safety guards upstream).
   */
  private _pyramidAwareCap(
    exercises: WorkoutExercise[],
    cap: number,
    safeDenominator: number,
    structureFloor: number = 1,
  ): WorkoutExercise[] {
    // Identification is structural-only: the `appliedProtocol` string is NOT
    // reliable at budget time (it may be injected after this pass runs).
    const isPyramid = (e: WorkoutExercise): boolean =>
      e.pyramidSequence != null && e.pyramidSequence.length > 0;

    const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
    if (totalSets <= cap) return exercises;

    // Pyramid exercises — never touched.
    const pyramidExes = exercises.filter(isPyramid);
    const pyramidSets = pyramidExes.reduce((s, e) => s + e.sets, 0);

    // Straight-set exercises — only these are eligible for reduction.
    const straightExes = exercises.filter(e => !isPyramid(e));
    const straightTarget = Math.max(0, cap - pyramidSets);

    if (straightExes.length === 0 || straightTarget <= 0) {
      // No straight-set exercises to trim — return as-is (pyramid budget is fixed).
      return exercises;
    }

    // Greedy decrement: repeatedly reduce the set count of the straight-set
    // exercise that currently has the highest number of sets.
    const mutable = straightExes.map(e => ({ ...e }));
    let setsToRemove = mutable.reduce((s, e) => s + e.sets, 0) - straightTarget;

    while (setsToRemove > 0) {
      // Sort descending by sets so [0] is the fattest candidate.
      mutable.sort((a, b) => b.sets - a.sets);
      const candidate = mutable[0];
      if (candidate.sets <= structureFloor) break; // floor (2 in normal mode — never thin below)
      candidate.sets -= 1;
      candidate.reasoning = [
        ...(candidate.reasoning ?? []),
        `pyramid_aware_cap:-1(budget_overage=${setsToRemove})`,
      ];
      setsToRemove -= 1;
    }

    // If greedy hit the floor and is still over target, the budget can't afford `structureFloor`
    // sets for every exercise. In normal mode (floor>1) DROP the lowest-score exercises (keep
    // floor(target/floor) at the floor) rather than thin survivors to 1; 5-min/blast (floor=1)
    // keep the legacy applySmartSetCap thinning.
    const straightCurrent = mutable.reduce((s, e) => s + e.sets, 0);
    let finalStraight: WorkoutExercise[];
    if (straightCurrent <= straightTarget) {
      finalStraight = mutable;
    } else if (structureFloor > 1) {
      // Keep the highest-score exercises the budget can afford at the floor, DROP the
      // rest. Pin survivors UP to the floor so a pre-thinned 1-set input can never
      // survive below floor (keep×floor ≤ straightTarget, so this never overspends).
      const keep = Math.max(1, Math.floor(straightTarget / structureFloor));
      finalStraight = [...mutable]
        .sort((a, b) => b.score - a.score)
        .slice(0, keep)
        .map(e =>
          e.sets < structureFloor
            ? {
                ...e,
                sets: structureFloor,
                reasoning: [...(e.reasoning ?? []), `structure_floor_pin:${e.sets}→${structureFloor}`],
              }
            : e,
        );
    } else {
      finalStraight = applySmartSetCap(mutable, straightTarget, Math.max(1, safeDenominator));
    }

    // Merge pyramid (unchanged) + trimmed straight-set exercises, preserving
    // the original insertion order from the input array.
    const byId = new Map<string, WorkoutExercise>();
    for (const e of [...pyramidExes, ...finalStraight]) {
      byId.set(e.exercise.id, e);
    }
    return exercises.map(e => byId.get(e.exercise.id) ?? e);
  }

  /**
   * Skill / Strength Cluster Cap (D3 only)
   *
   * When the session is Bolt-3 (Intense) AND the user is on a skill/strength
   * track (has explicit priority1SkillIds OR session is single-domain), the
   * engine must consolidate volume rather than thin-spreading it across 7+
   * exercises at 2 sets each.
   *
   * Algorithm:
   *   1. Cap main-block to MAX SKILL_CLUSTER_MAX_MAIN unique exercises.
   *   2. Keep exercises ranked by `resolveTierSubOrder` (canonical
   *      elite → hard → skill/compound → foundation → match → flow priority),
   *      then by score as tiebreaker.
   *   3. Redistribute the remaining set budget (up to SKILL_CLUSTER_MAX_SETS
   *      per exercise) on to the surviving exercises, prioritising the
   *      highest-tier exercises first so an elite planche hold gets 5 sets
   *      before a match accessory gets its 3rd.
   *
   * Migrated verbatim from WorkoutGenerator.ts Step 5h (Phase 3a).
   */
  private _skillClusterCap(
    exercises: WorkoutExercise[],
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
    constraints: BudgetConstraints,
    log: string[],
  ): WorkoutExercise[] {
    const isSkillOrStrengthSession =
      (context.priority1SkillIds?.length ?? 0) > 0 || constraints.isSingleDomain;

    if (difficulty !== 3 || !isSkillOrStrengthSession) {
      return exercises;
    }

    const mainExes = exercises.filter(e => (e.exerciseRole ?? 'main') === 'main');
    if (mainExes.length <= SKILL_CLUSTER_MAX_MAIN) {
      return exercises;
    }

    // Pyramid exercises are immune to culling — their step count is fixed.
    // Identification uses the structural array only; appliedProtocol is not
    // reliable at this stage of the pipeline.
    const pyramidMainIds = new Set(
      mainExes
        .filter(e => (e.pyramidSequence?.length ?? 0) > 0)
        .map(e => e.exercise.id),
    );
    const straightMainExes = mainExes.filter(e => !pyramidMainIds.has(e.exercise.id));

    // Slots available for straight-set exercises after reserving pyramid slots.
    const slotsForStraight = Math.max(0, SKILL_CLUSTER_MAX_MAIN - pyramidMainIds.size);

    // Tier sub-order priority is the canonical `resolveTierSubOrder` from
    // workout-sorting.utils (elite → hard → skill/compound → foundation →
    // match → flow).  No local duplicate is kept here.
    const sortedMain = [...straightMainExes].sort((a, b) => {
      const ta = resolveTierSubOrder(a);
      const tb = resolveTierSubOrder(b);
      if (ta !== tb) return ta - tb;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    const keepIds = new Set<string>([
      ...pyramidMainIds,
      ...sortedMain.slice(0, slotsForStraight).map(e => e.exercise.id),
    ]);
    const removedCount = mainExes.length - keepIds.size;
    let next = exercises.filter(
      e => (e.exerciseRole ?? 'main') !== 'main' || keepIds.has(e.exercise.id),
    );

    // Redistribute freed set budget onto survivors (highest tier first)
    if (constraints.dailySetBudget != null) {
      const survivingMain = next.filter(e => (e.exerciseRole ?? 'main') === 'main');
      const currentSets = survivingMain.reduce((s, e) => s + e.sets, 0);
      let setsToFill = constraints.dailySetBudget - currentSets;

      const fillOrder = [...survivingMain].sort(
        (a, b) => resolveTierSubOrder(a) - resolveTierSubOrder(b),
      );

      for (const ex of fillOrder) {
        if (setsToFill <= 0) break;
        const canAdd = SKILL_CLUSTER_MAX_SETS - ex.sets;
        if (canAdd > 0) {
          const added = Math.min(canAdd, setsToFill);
          ex.sets += added;
          ex.reasoning.push(
            `skill_cluster:+${added}(tier=${ex.tier ?? ex.priority},cap=${SKILL_CLUSTER_MAX_SETS})`,
          );
          setsToFill -= added;
        }
      }
    }

    log.push(
      `skill_cluster_cap: culled ${removedCount} excess main exercises → ${SKILL_CLUSTER_MAX_MAIN} clustered`,
    );
    const survivorSets = next
      .filter(e => (e.exerciseRole ?? 'main') === 'main')
      .map(e => e.sets)
      .join('/');
    console.log(
      `[BudgetDistributor.skillClusterCap] D3 skill/strength session — culled ${removedCount} ` +
      `exercise(s) → ${SKILL_CLUSTER_MAX_MAIN} clustered exercises. Sets: ${survivorSets}`,
    );

    return next;
  }

  /**
   * Balanced Cluster Cap (D2 only) — symmetric to `_skillClusterCap`.
   *
   * Fixes the "fragmentation" bug observed in live logs where a balanced
   * session ended up with 7 main exercises at 2 sets each — the user's
   * daily budget thinly spread across too many movements.  The cap forces
   * a deep-focus block of 3 (baseline) or 4 (diverse) exercises and
   * redistributes any freed sets up to a hypertrophy ceiling of 4 per
   * exercise.
   *
   * Diversity rule:
   *   The session unlocks the 4-exercise cap when its main block spans
   *   ≥ BALANCED_DIVERSITY_THRESHOLD (= 3) distinct LOGICAL domains
   *   (push / pull / legs / core / skill-track), as resolved through
   *   `MG_TO_DOMAIN`.  A 3-domain main block is genuinely full-body and
   *   benefits from the extra slot for breadth; anything narrower
   *   (≤ 2 domains) is too focused to justify spreading sets thinner.
   *
   * Survivor selection mirrors `_skillClusterCap`:
   *   1. Sort main exercises by `resolveTierSubOrder` (elite → hard →
   *      skill/compound → foundation → match → flow), score as tiebreak.
   *   2. Keep the top `maxAllowed` main exercises.
   *   3. Redistribute the freed budget upward (highest tier first) up to
   *      `BALANCED_CLUSTER_MAX_SETS` per exercise.
   */
  private _balancedClusterCap(
    exercises: WorkoutExercise[],
    difficulty: DifficultyLevel,
    constraints: BudgetConstraints,
    log: string[],
  ): WorkoutExercise[] {
    if (difficulty !== 2) return exercises;

    const mainExes = exercises.filter(e => (e.exerciseRole ?? 'main') === 'main');
    if (mainExes.length === 0) return exercises;

    // Diversity test — count distinct LOGICAL domains (push/pull/legs/core/
    // skill-track) across the main block.  Skill-track MGs (planche,
    // muscle_up, etc.) map to their own canonical slug via MG_TO_DOMAIN,
    // so a Planche + Pullup + Squat session counts as 3 distinct domains
    // (planche / pull / legs) — diverse enough to warrant the 4-slot cap.
    const distinctDomains = new Set<string>();
    for (const e of mainExes) {
      const mg = e.exercise.movementGroup ?? '';
      const domain = MG_TO_DOMAIN[mg] ?? mg;
      if (domain) distinctDomains.add(domain);
    }
    const isDiverse = distinctDomains.size >= BALANCED_DIVERSITY_THRESHOLD;
    const maxAllowed = isDiverse
      ? BALANCED_CLUSTER_MAX_MAIN_DIVERSE
      : BALANCED_CLUSTER_MAX_MAIN_BASELINE;

    if (mainExes.length <= maxAllowed) return exercises;

    // Pyramid exercises are immune to culling — their step count is fixed.
    // Identification uses the structural array only; appliedProtocol is not
    // reliable at this stage of the pipeline.
    const pyramidMainIds = new Set(
      mainExes
        .filter(e => (e.pyramidSequence?.length ?? 0) > 0)
        .map(e => e.exercise.id),
    );
    const straightMainExes = mainExes.filter(e => !pyramidMainIds.has(e.exercise.id));

    // Slots available for straight-set exercises after reserving pyramid slots.
    const slotsForStraight = Math.max(0, maxAllowed - pyramidMainIds.size);

    // Rank survivors by canonical tier sub-order (elite → hard → skill/compound
    // → foundation → match → flow), score descending as tiebreak — same
    // contract as `_skillClusterCap` so both clusters use ONE quality scale.
    const sortedMain = [...straightMainExes].sort((a, b) => {
      const ta = resolveTierSubOrder(a);
      const tb = resolveTierSubOrder(b);
      if (ta !== tb) return ta - tb;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    const keepIds = new Set<string>([
      ...pyramidMainIds,
      ...sortedMain.slice(0, slotsForStraight).map(e => e.exercise.id),
    ]);
    const removedCount = mainExes.length - keepIds.size;
    let next = exercises.filter(
      e => (e.exerciseRole ?? 'main') !== 'main' || keepIds.has(e.exercise.id),
    );

    // Redistribute freed set budget onto survivors (highest tier first),
    // capped at BALANCED_CLUSTER_MAX_SETS per exercise (hypertrophy ceiling).
    if (constraints.dailySetBudget != null) {
      const survivingMain = next.filter(e => (e.exerciseRole ?? 'main') === 'main');
      const currentSets = survivingMain.reduce((s, e) => s + e.sets, 0);
      let setsToFill = constraints.dailySetBudget - currentSets;

      const fillOrder = [...survivingMain].sort(
        (a, b) => resolveTierSubOrder(a) - resolveTierSubOrder(b),
      );

      for (const ex of fillOrder) {
        if (setsToFill <= 0) break;
        const canAdd = BALANCED_CLUSTER_MAX_SETS - ex.sets;
        if (canAdd > 0) {
          const added = Math.min(canAdd, setsToFill);
          ex.sets += added;
          ex.reasoning.push(
            `balanced_cluster:+${added}(tier=${ex.tier ?? ex.priority},cap=${BALANCED_CLUSTER_MAX_SETS})`,
          );
          setsToFill -= added;
        }
      }
    }

    log.push(
      `balanced_cluster_cap: culled ${removedCount} excess main exercises → ${maxAllowed} ` +
      `(diverse=${isDiverse}, domains=${distinctDomains.size})`,
    );
    const survivorSets = next
      .filter(e => (e.exerciseRole ?? 'main') === 'main')
      .map(e => e.sets)
      .join('/');
    console.log(
      `[BudgetDistributor.balancedClusterCap] D2 balanced session — culled ${removedCount} ` +
      `exercise(s) → ${maxAllowed} clustered exercises (diverse=${isDiverse}, ` +
      `domains=${distinctDomains.size}). Sets: ${survivorSets}`,
    );

    return next;
  }

  /**
   * Post-correction pass: re-enforces budget caps on an already-stamped
   * WorkoutExercise list without re-running assignVolume from scratch.
   *
   * Called by PipelineOrchestrator AFTER WorkoutGenerator's generateWorkout()
   * to guarantee that BudgetDistributor's modular constraints are the final
   * word — overriding any drift introduced by WorkoutGenerator's legacy
   * Steps 4b–4d when `context.useModularPipeline` is not yet fully threaded.
   *
   * Safe to call even when no caps are active (returns the list unchanged).
   */
  reapplyCaps(
    exercises: WorkoutExercise[],
    constraints: BudgetConstraints,
    context?: WorkoutGenerationContext,
  ): WorkoutExercise[] {
    if (exercises.length === 0) return exercises;

    // Use the same denominator logic as distribute() for consistency.
    const rawDenominator = constraints.isSingleDomain
      ? exercises.length
      : Math.max(1, constraints.exerciseSlotCount);
    const safeDenominator = Math.max(1, rawDenominator);

    // ③ item 5 (structure floor): mirror distribute() — the authoritative final
    // pass must DROP the lowest-score exercises rather than thin survivors below
    // 2 sets. Without this, reapplyCaps used the default floor=1 and produced the
    // "N exercises × 1 set" fragmentation. 5-min (≤10) + blast sessions legitimately
    // allow a single set, so they keep floor 1. No context → floor 1 (legacy safety net).
    const structureFloor =
      context && context.availableTime > 10 && context.intentMode !== 'blast'
        ? 2
        : 1;

    let result = [...exercises];
    const log: string[] = [];

    // ── Pyramid set-count lock ─────────────────────────────────────────────
    // Re-pin pyramid steps before any cap so a downstream caller cannot have
    // previously set a wrong `sets` value (e.g. legacy generateWorkout path).
    let pinned = 0;
    for (const ex of result) {
      if (ex.pyramidSequence && ex.pyramidSequence.length > 0) {
        const correct = ex.pyramidSequence.length;
        if (ex.sets !== correct) {
          ex.sets = correct;
          pinned++;
        }
      }
    }
    if (pinned > 0) {
      log.push(`reapply_pyramid_pin: ${pinned} exercise(s) re-locked to sequence length`);
    }

    // ── Budget caps — pyramid-aware (never clip pyramid steps) ────────────
    if (constraints.maxSets != null && constraints.maxSets > 0) {
      const before = result.reduce((s, e) => s + e.sets, 0);
      result = this._pyramidAwareCap(result, constraints.maxSets, safeDenominator, structureFloor);
      const after = result.reduce((s, e) => s + e.sets, 0);
      if (after < before) log.push(`reapply_max_sets: ${before}→${after}`);
    }

    if (
      constraints.remainingWeeklyBudget != null &&
      constraints.remainingWeeklyBudget > 0
    ) {
      const total = result.reduce((s, e) => s + e.sets, 0);
      if (total > constraints.remainingWeeklyBudget) {
        const before = total;
        result = this._pyramidAwareCap(result, constraints.remainingWeeklyBudget, safeDenominator, structureFloor);
        log.push(`reapply_weekly: ${before}→${result.reduce((s, e) => s + e.sets, 0)}`);
      }
    }

    if (constraints.dailySetBudget != null && constraints.dailySetBudget > 0) {
      const total = result.reduce((s, e) => s + e.sets, 0);
      if (total > constraints.dailySetBudget) {
        const before = total;
        result = this._pyramidAwareCap(result, constraints.dailySetBudget, safeDenominator, structureFloor);
        log.push(`reapply_daily: ${before}→${result.reduce((s, e) => s + e.sets, 0)} (cap=${constraints.dailySetBudget})`);
      }
    }

    if (log.length > 0) {
      console.log(`[BudgetDistributor.reapplyCaps] ${log.join(', ')}`);
    }

    return result;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Returns a fresh BudgetDistributor instance.
 * The stateless factory pattern ensures each call site (PipelineOrchestrator)
 * gets an isolated instance with no cross-option state contamination.
 */
export function createBudgetDistributor(): BudgetDistributor {
  return new BudgetDistributor();
}
