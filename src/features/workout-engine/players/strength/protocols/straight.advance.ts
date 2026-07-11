/**
 * straight.advance — the default (straight-sets) advance head
 * (protocol-blocks Stage 1b, 11.07.2026).
 *
 * Behavior is verbatim from the Stage-1a extraction: same exercise while
 * sets remain → next exercise in segment → segment chain. Pyramid steps
 * ride this exact path (pyramid.advance.ts re-exports it) — the per-step
 * targets come from set-target.utils, not from the advance layer.
 */
import type { AdvanceStrategy } from './advance-strategy.types';
import { advanceOutOfSegment } from './segment-chain';

export const straightAdvance: AdvanceStrategy = (ctx) => {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, getExercises, getSets } = ctx;

  const exercises = getExercises(segments[currentSegmentIndex]);
  if (!exercises || exercises.length === 0) return advanceOutOfSegment(ctx);

  const currentEx = exercises[prevExerciseIndex];
  const setsForCurrentEx = getSets(currentEx);

  console.log('[Engine] moveToNext (straight sets)', { currentSegmentIndex, setIdx });

  if (currentEx?.pyramidSequence) {
    console.log(
      `[Engine] Processing Pyramid Step via native straight-sets. ` +
      `Set: ${setIdx + 1}/${currentEx.pyramidSequence.length}`,
    );
  }

  if (setIdx < setsForCurrentEx - 1) {
    const nextSet = setIdx + 1;
    console.log(`[Engine] Same exercise, next set ${nextSet + 1}/${setsForCurrentEx}`);
    return { kind: 'sameExercise', nextSetIdx: nextSet };
  }

  if (prevExerciseIndex < exercises.length - 1) {
    return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex + 1, nextSetIdx: 0 };
  }

  return advanceOutOfSegment(ctx);
};
