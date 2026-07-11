/**
 * compute-advance — the advance decision entry point
 * (protocol-blocks Stage 1a extraction, Stage 1b dispatch — 11.07.2026).
 *
 * PURE: no React, no refs, no timers. The hook feeds it the updater's `prev`
 * exercise index + the live set counter and applies the returned decision to
 * its setters — behavior is characterization-locked to be identical to the
 * pre-extraction moveToNext monolith (see __tests__/compute-advance.test.ts).
 *
 * Stage 1b: the per-protocol logic lives in straight/superset/pyramid
 * .advance.ts modules behind advance-registry; this file only resolves the
 * current exercise's head and delegates. Block-scoped heads (tabata/emom/
 * amrap) will be resolved from segment.protocol BEFORE the per-exercise
 * derivation when they land (Stages 2-3).
 */
import type { AdvanceContext, AdvanceDecision } from './advance-strategy.types';
import { resolveAdvanceStrategy, resolveBlockStrategy, resolveExerciseProtocol } from './advance-registry';
import { advanceOutOfSegment } from './segment-chain';

export { findNextValidSegment } from './segment-chain';

export function computeAdvanceDecision(ctx: AdvanceContext): AdvanceDecision {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, getExercises } = ctx;

  const exercises = getExercises(segments[currentSegmentIndex]);
  if (!exercises || exercises.length === 0) {
    return advanceOutOfSegment(ctx);
  }

  // Block-scoped dispatch FIRST (Stage 2): a validated segment.protocol
  // (tabata/emom/amrap) owns the whole segment — per-exercise markers like
  // pairedWith are ignored inside a block.
  const blockStrategy = resolveBlockStrategy(segments[currentSegmentIndex]);
  if (blockStrategy) {
    return blockStrategy(ctx);
  }

  const currentEx = exercises[prevExerciseIndex];

  console.log(
    `[Engine][moveToNext] seg=${currentSegmentIndex} ex[${prevExerciseIndex}]="${currentEx?.name}" ` +
    `pairedWith=${currentEx?.pairedWith ?? 'NONE'} setIdx=${setIdx} ` +
    `protocol=${resolveExerciseProtocol(currentEx)}`,
  );

  return resolveAdvanceStrategy(currentEx)(ctx);
}
