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
import {
  TABATA_CLASSIC,
  TABATA_MIN_EXERCISES,
  TABATA_MAX_EXERCISES,
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
  context: { intentMode?: string },
): TabataBlockSpec | undefined {
  if (setType !== 'tabata') return undefined;

  if (context.intentMode === 'blast') {
    console.log('[TabataBlock] intentMode=blast takes precedence — tabata not assembled');
    return undefined;
  }

  const candidates = exercises
    .filter((ex) => (ex.exerciseRole ?? 'main') === 'main' && ex.tier !== 'elite')
    .sort((a, b) => b.score - a.score)
    .slice(0, TABATA_MAX_EXERCISES);

  if (candidates.length < TABATA_MIN_EXERCISES) {
    console.log(
      `[TabataBlock] Only ${candidates.length} eligible main(s) (need ≥${TABATA_MIN_EXERCISES}) ` +
      '— reverting to straight sets',
    );
    return undefined;
  }

  for (const ex of candidates) {
    ex.protocolBlock = 'tabata';
    ex.reasoning.push('tabata_block:member');
  }

  console.log(
    `[TabataBlock] ✅ Block assembled: ${candidates.length} exercises × ` +
    `${TABATA_CLASSIC.rounds} intervals (${TABATA_CLASSIC.workSec}/${TABATA_CLASSIC.restSec}) — ` +
    `[${candidates.map((c) => (c.exercise.name as { he?: string })?.he ?? c.exercise.id).join(', ')}]`,
  );

  return {
    config: TABATA_CLASSIC,
    exerciseIds: candidates.map((c) => c.exercise.id),
  };
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
