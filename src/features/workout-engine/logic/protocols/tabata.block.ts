/**
 * tabata.block — generator-side tabata block assembly + mapper partition
 * (protocol-blocks Stage 3.1, 12.07.2026).
 *
 * WHEN a block is emitted: the existing protocol lottery (selectProtocol)
 * rolls 'tabata' from the admin's preferredProtocols at the shared
 * protocolProbability (× periodization multiplier — Deload kills it, the
 * Bolt-1 guard and the Bolt-3 pyramid override apply upstream, unchanged).
 * This module only decides WHAT goes into the block once the roll landed.
 *
 * Precedence: intentMode 'blast' (custom builder D3≤20min) wins over
 * tabata — two timed modes must never double-fire.
 */
import type { TabataBlockSpec, WorkoutExercise } from '../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getIsometricTimeCap } from '../workout-budgeting.utils';
import {
  TABATA_CLASSIC,
  TABATA_MIN_EXERCISES,
  TABATA_MAX_EXERCISES,
  tabataIntervalCost,
} from './tabata.constants';

/**
 * Assemble the tabata block from the FINAL exercise list (call after every
 * list mutation, before duration pricing). Picks the top-scored 2-4
 * non-elite mains — elite-tier movements (Δ≥+2) are near-max efforts that
 * do not survive 8×20s intervals. Stamps `protocolBlock` on the members
 * (in place, pyramid-processor style) so the estimator and volume guards
 * recognize them structurally.
 *
 * Returns undefined (and stamps nothing) when the block cannot be
 * assembled — the caller reverts setType to 'straight'.
 */
export function buildTabataBlock(
  setType: string,
  exercises: WorkoutExercise[],
  context: { intentMode?: string; tabataPool?: Exercise[]; userLevel?: number },
): TabataBlockSpec | undefined {
  if (setType !== 'tabata') return undefined;

  if (context.intentMode === 'blast') {
    console.log('[TabataBlock] intentMode=blast takes precedence — tabata not assembled');
    return undefined;
  }

  // ── Pool-injection (David 25.07): when the dedicated conditioning pool is
  // provided, build the finisher FROM it and inject the members (added-finisher
  // model) — independent of which strength mains were selected. This is the
  // production path; the mains-subset logic below is the no-pool fallback
  // (unit tests, or a missing pool).
  if (context.tabataPool?.length) {
    return buildTabataFromPool(exercises, context.tabataPool, context.userLevel ?? 1);
  }

  // ── Eligibility (David's rules, 12.07.2026) ───────────────────────────
  // A candidate must be sustainable for a full 20s work interval AT THE
  // USER'S LEVEL. Rep exercises (pushups/squats/lunges) and sustainable
  // holds (plank, side plank) are IN; only max-effort skill work is OUT:
  // - tier 'elite' (Δ≥+2, near-max) — existing rule;
  // - getIsometricTimeCap < workSec — the engine's own skill-lever ceiling
  //   (planche/'פלאנץ', front lever/'פרונט', flag/'דגל', one-arm/'יד אחת',
  //   level≥8) caps at 15s: cannot hold 20s, for holds AND rep variants.
  //   NOTE: this is the DETERMINISTIC encoding — assigned hold seconds
  //   (ex.reps) are a random draw per bolt and would flip planks in/out.
  //   priority==='skill' misses planche entirely (corpus spells 'פלאנץ׳',
  //   the skill pattern matches 'פלאנש') — do not "simplify" to it.
  // - time-based at tier 'hard' (Δ=+1): prescribed 5-10s holds, capped 15s.
  // Unilateral is ELIGIBLE and costs 2 intervals (right→left consecutive).
  //
  // David 25.07 — the conditioning gate: a member MUST carry the curated
  // `hiit_friendly` tag (the 109 tabata pool), and must be AT-OR-BELOW the
  // user's level (`!isOverLevel`, bias to the easy side). `isOverLevel`
  // absent ⇒ treated as false ⇒ passes — level-less pool entries default IN,
  // never dropped as over-level.
  const eligible = exercises
    .filter(
      (ex) =>
        (ex.exerciseRole ?? 'main') === 'main' &&
        (ex.exercise.tags?.includes('hiit_friendly') ?? false) &&
        !ex.isOverLevel &&
        !Array.isArray(ex.pyramidSequence) &&
        ex.tier !== 'elite' &&
        getIsometricTimeCap(ex.exercise) >= TABATA_CLASSIC.workSec &&
        !(ex.isTimeBased && ex.tier === 'hard'),
    )
    .sort((a, b) => b.score - a.score);

  // ── Composition: interval costs must tile `rounds` exactly ─────────────
  // Σ member costs (uni=2, bi=1) must DIVIDE rounds so no cycle truncates
  // mid-exercise (or mid-side). Brute-force the best-scoring valid subset
  // from the top candidates (pool ≤ 6 → ≤ 63 subsets).
  const pool = eligible.slice(0, 6);
  let best: WorkoutExercise[] | null = null;
  let bestScore = -1;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const subset = pool.filter((_, i) => mask & (1 << i));
    if (subset.length < TABATA_MIN_EXERCISES || subset.length > TABATA_MAX_EXERCISES) continue;
    const cycleCost = subset.reduce((s, e) => s + tabataIntervalCost(e.exercise.symmetry), 0);
    if (cycleCost > TABATA_CLASSIC.rounds || TABATA_CLASSIC.rounds % cycleCost !== 0) continue;
    const score = subset.reduce((s, e) => s + e.score, 0);
    if (score > bestScore) {
      bestScore = score;
      best = subset;
    }
  }

  if (!best) {
    console.log(
      `[TabataBlock] No valid composition from ${eligible.length} eligible candidate(s) ` +
      `(need ${TABATA_MIN_EXERCISES}-${TABATA_MAX_EXERCISES} members whose interval costs tile ` +
      `${TABATA_CLASSIC.rounds}) — reverting to straight sets`,
    );
    return undefined;
  }

  for (const ex of best) {
    ex.protocolBlock = 'tabata';
    ex.reasoning.push('tabata_block:member');
  }

  const cycleCost = best.reduce((s, e) => s + tabataIntervalCost(e.exercise.symmetry), 0);
  console.log(
    `[TabataBlock] ✅ Block assembled: ${best.length} exercises (cycle cost ${cycleCost} → ` +
    `${TABATA_CLASSIC.rounds / cycleCost} cycles of ${TABATA_CLASSIC.rounds} intervals, ` +
    `${TABATA_CLASSIC.workSec}/${TABATA_CLASSIC.restSec}) — ` +
    `[${best.map((c) => (c.exercise.name as { he?: string })?.he ?? c.exercise.id).join(', ')}]`,
  );

  return {
    config: TABATA_CLASSIC,
    exerciseIds: best.map((c) => c.exercise.id),
  };
}

/** Level of a pool exercise = min targetPrograms level, or 1 when level-less
 *  (David's rule: program-less conditioning gems default IN, never dropped). */
function poolLevelOf(ex: Exercise): number {
  const lv = (ex.targetPrograms ?? [])
    .map((t) => t.level)
    .filter((n): n is number => typeof n === 'number');
  return lv.length ? Math.min(...lv) : 1;
}

/** Largest valid 2-4 subset whose interval costs (unilateral=2) tile 8 exactly. */
function pickTilingSubset(cands: Exercise[]): Exercise[] | null {
  let best: Exercise[] | null = null;
  for (let mask = 1; mask < 1 << cands.length; mask++) {
    const subset = cands.filter((_, i) => (mask & (1 << i)) !== 0);
    if (subset.length < TABATA_MIN_EXERCISES || subset.length > TABATA_MAX_EXERCISES) continue;
    const cost = subset.reduce((s, e) => s + tabataIntervalCost(e.symmetry), 0);
    if (cost > TABATA_CLASSIC.rounds || TABATA_CLASSIC.rounds % cost !== 0) continue;
    if (!best || subset.length > best.length) best = subset; // prefer more members (variety)
  }
  return best;
}

/**
 * Pool-injection block builder (David 25.07): select 2-4 conditioning members
 * from the dedicated `hiit_friendly` pool — at-or-below the user's level
 * (level-less defaults IN, easy-biased), interval costs tiling 8 — and PUSH
 * them into the workout as a protocolBlock finisher (added, not replacing).
 * Returns undefined (→ straight) when the pool can't yield a valid 2-4 subset.
 */
function buildTabataFromPool(
  target: WorkoutExercise[],
  pool: Exercise[],
  userLevel: number,
): TabataBlockSpec | undefined {
  const eligible = pool
    .filter((ex) => getIsometricTimeCap(ex) >= TABATA_CLASSIC.workSec && poolLevelOf(ex) <= userLevel)
    .sort((a, b) => poolLevelOf(a) - poolLevelOf(b)); // easiest first

  if (eligible.length < TABATA_MIN_EXERCISES) {
    console.log(`[TabataBlock] pool: only ${eligible.length} eligible ≤L${userLevel} — reverting to straight`);
    return undefined;
  }

  // Easy-biased candidate window, shuffled for cross-session variety.
  const window = eligible.slice(0, Math.max(8, Math.ceil(eligible.length * 0.5)));
  for (let i = window.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [window[i], window[j]] = [window[j], window[i]];
  }

  const members = pickTilingSubset(window.slice(0, 8));
  if (!members) {
    console.log('[TabataBlock] pool: no cost-tiling 2-4 subset — reverting to straight');
    return undefined;
  }

  for (const ex of members) {
    target.push({
      exercise: ex,
      method: {} as WorkoutExercise['method'],
      mechanicalType: ex.mechanicalType ?? 'none',
      sets: 1,
      reps: TABATA_CLASSIC.workSec,
      isTimeBased: false,
      restSeconds: TABATA_CLASSIC.restSec,
      priority: 'compound',
      score: 0,
      reasoning: ['tabata_block:member', 'tabata_pool_injected'],
      exerciseRole: 'main',
      tier: 'match',
      protocolBlock: 'tabata',
    } as WorkoutExercise);
  }

  console.log(
    `[TabataBlock] ✅ pool-injected ${members.length} conditioning member(s): ` +
    `[${members.map((m) => (m.name as { he?: string })?.he ?? m.id).join(', ')}]`,
  );
  return { config: TABATA_CLASSIC, exerciseIds: members.map((m) => m.id) };
}

/**
 * Mapper-side partition (home/page.tsx): split the mapped main exercises
 * into block members vs standard mains by the generator's exerciseIds.
 * Defensive: if swaps/removals left fewer than the minimum, the block is
 * dissolved back into the main segment (straight sets) rather than
 * shipping a degenerate one-exercise tabata.
 */
export function partitionByTabataBlock<T extends { id: string }>(
  mainExercises: T[],
  block: TabataBlockSpec | undefined | null,
): { tabata: T[]; rest: T[] } {
  if (!block || !Array.isArray(block.exerciseIds) || block.exerciseIds.length === 0) {
    return { tabata: [], rest: mainExercises };
  }
  const ids = new Set(block.exerciseIds);
  const tabata = mainExercises.filter((e) => ids.has(e.id));
  if (tabata.length < TABATA_MIN_EXERCISES) {
    if (tabata.length > 0) {
      console.warn(
        `[TabataBlock] Block degenerated to ${tabata.length} member(s) at plan-build — ` +
        'dissolving back into the main segment',
      );
    }
    return { tabata: [], rest: mainExercises };
  }
  return { tabata, rest: mainExercises.filter((e) => !ids.has(e.id)) };
}
