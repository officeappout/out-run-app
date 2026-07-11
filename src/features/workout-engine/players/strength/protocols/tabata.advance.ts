/**
 * tabata.advance — the first BLOCK-SCOPED advance head
 * (protocol-blocks Stage 2, 11.07.2026).
 *
 * Round-robin over the segment's exercises, one work interval each, until
 * config.rounds work intervals are done → shared segment chain. The clock
 * (workSec/restSec) is NOT here — heads are pure decision functions; the
 * state machine runs the timers (IsometricTimerCard for work, the existing
 * RESTING countdown for rest) and calls moveToNext at each transition.
 *
 * Index mapping onto the existing machine:
 *   currentExerciseIndex = position in the round-robin cycle
 *   currentSetIndex      = which pass over the exercise list (cycle counter)
 *   completed intervals  = setIdx * numExercises + exerciseIndex + 1
 */
import type { AdvanceContext, AdvanceDecision, AdvanceStrategy } from './advance-strategy.types';
import { advanceOutOfSegment } from './segment-chain';
import { resolveBlockProtocol } from './block-protocol';

export interface TabataIntervalInfo {
  /** 0-based index of the work interval at [setIdx, exerciseIndex]. */
  intervalIndex: number;
  /** True when this interval is the block's last — no trailing rest. */
  isLastInterval: boolean;
}

/** Pure interval arithmetic — used by the head AND the state machine. */
export function tabataIntervalInfo(args: {
  numExercises: number;
  exerciseIndex: number;
  setIdx: number;
  rounds: number;
}): TabataIntervalInfo {
  const n = Math.max(1, args.numExercises);
  const intervalIndex = args.setIdx * n + args.exerciseIndex;
  return {
    intervalIndex,
    isLastInterval: intervalIndex + 1 >= args.rounds,
  };
}

export const tabataAdvance: AdvanceStrategy = (ctx): AdvanceDecision => {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, getExercises } = ctx;

  const currentSeg = segments[currentSegmentIndex];
  const exercises = getExercises(currentSeg);
  if (!exercises || exercises.length === 0) return advanceOutOfSegment(ctx);

  const block = resolveBlockProtocol(currentSeg);
  if (!block) {
    // Defensive: dispatch should never route here without a valid config.
    console.warn('[Engine][Tabata] head invoked without valid config — leaving segment');
    return advanceOutOfSegment(ctx);
  }

  const { isLastInterval, intervalIndex } = tabataIntervalInfo({
    numExercises: exercises.length,
    exerciseIndex: prevExerciseIndex,
    setIdx,
    rounds: block.config.rounds,
  });

  console.log(
    `[Engine][Tabata] interval ${intervalIndex + 1}/${block.config.rounds} done ` +
    `(ex[${prevExerciseIndex}]="${exercises[prevExerciseIndex]?.name}", cycle ${setIdx + 1})`,
  );

  if (isLastInterval) {
    return advanceOutOfSegment(ctx);
  }

  if (prevExerciseIndex < exercises.length - 1) {
    // Next exercise in the cycle — cycle counter unchanged.
    return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex + 1, nextSetIdx: null };
  }

  // Cycle complete — back to the first exercise, next pass.
  return { kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: setIdx + 1 };
};
