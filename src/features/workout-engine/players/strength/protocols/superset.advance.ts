/**
 * superset.advance — the paired-exercise advance head
 * (protocol-blocks Stage 1b, 11.07.2026).
 *
 * Behavior is verbatim from the Stage-1a extraction: A→B same round,
 * B→A with round increment, rounds equalized to max(A.sets, B.sets),
 * pair-complete sandwich scan for incomplete standalones, then the
 * shared segment chain. Missing partner warns and delegates to the
 * straight head (including its log lines).
 */
import type { AdvanceStrategy } from './advance-strategy.types';
import { advanceOutOfSegment } from './segment-chain';
import { straightAdvance } from './straight.advance';

export const supersetAdvance: AdvanceStrategy = (ctx) => {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, log, getExercises, getSets } = ctx;

  const currentSeg = segments[currentSegmentIndex];
  const exercises = getExercises(currentSeg);
  if (!exercises || exercises.length === 0) return advanceOutOfSegment(ctx);

  const currentEx = exercises[prevExerciseIndex];
  const pairedId = currentEx?.pairedWith;
  const pairedIndex = pairedId ? exercises.findIndex((e) => e.id === pairedId) : -1;

  if (pairedIndex === -1) {
    // Partner not found in this segment — warn and fall back to straight.
    console.warn(
      `[Engine][Superset] ⚠️ "${currentEx?.name}" has pairedWith="${pairedId}" ` +
      `but no exercise with that id was found in segment ${currentSegmentIndex}. ` +
      `Segment exercises: [${exercises.map((e) => `${e.name}(${e.id})`).join(', ')}]. ` +
      `Falling back to straight sets — check that both paired exercises share the same exerciseRole.`,
    );
    return straightAdvance(ctx);
  }

  // Equalize round count to Math.max(A.sets, B.sets) — mirrors the
  // playlist's equalizedSets so the engine terminates after the same
  // number of rounds the UI renders pills for.
  const pairedPartner = exercises[pairedIndex];
  const effectiveSets = Math.max(getSets(currentEx), getSets(pairedPartner));

  const isFirstInPair = pairedIndex > prevExerciseIndex;

  if (isFirstInPair) {
    // Current = A (first), partner = B (second) → go to B, same round.
    console.log(`[Engine][Superset] A→B (round ${setIdx + 1}/${effectiveSets}) "${currentEx?.name}" → "${exercises[pairedIndex]?.name}"`);
    return { kind: 'goToExercise', exerciseIndex: pairedIndex, nextSetIdx: null };
  }

  if (setIdx < effectiveSets - 1) {
    // Current = B — more rounds → back to A, increment round.
    const nextRound = setIdx + 1;
    console.log(`[Engine][Superset] B→A (round ${nextRound + 1}/${effectiveSets}) "${currentEx?.name}" → "${exercises[pairedIndex]?.name}"`);
    return { kind: 'goToExercise', exerciseIndex: pairedIndex, nextSetIdx: nextRound };
  }

  // All rounds done. Scan the segment for the first exercise with sets
  // remaining in the log — handles "sandwich" layouts where the pair is
  // not adjacent (e.g. [A@0, standalone@1, B@2]).
  const segId = currentSeg?.id || String(currentSegmentIndex);
  const nextIncompleteIndex = exercises.findIndex((ex) => {
    // Superset partners are managed exclusively by the round counter
    // above — including them here would re-enter A/B and skip the true
    // next target (standalone siblings).
    if (ex.pairedWith != null) return false;
    const totalSets = getSets(ex);
    const logEntry = log.find((e) => e.exerciseId === ex.id && e.segmentId === segId);
    return (logEntry?.confirmedReps.length ?? 0) < totalSets;
  });
  console.log(
    `[Engine][Superset] Pair complete (${effectiveSets} rounds). ` +
    `Next incomplete index=${nextIncompleteIndex}`,
  );
  if (nextIncompleteIndex !== -1) {
    return { kind: 'goToExercise', exerciseIndex: nextIncompleteIndex, nextSetIdx: 0 };
  }
  return advanceOutOfSegment(ctx);
};
