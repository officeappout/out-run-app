/**
 * compute-advance — the advance decision, extracted VERBATIM from
 * useWorkoutStateMachine.moveToNext (protocol-blocks Stage 1a, 11.07.2026).
 *
 * PURE: no React, no refs, no timers. The hook feeds it the updater's `prev`
 * exercise index + the live set counter and applies the returned decision to
 * its setters — behavior is characterization-tested to be identical to the
 * pre-extraction monolith (see __tests__/compute-advance.test.ts).
 *
 * Stage 1b splits this into per-protocol strategy modules behind a registry;
 * the logic here is the straight-sets + superset ("order-based") core.
 */
import type { WorkoutSegment } from '@/features/parks/core/types/route.types';
import type { AdvanceContext, AdvanceDecision, AdvanceExercise } from './advance-strategy.types';

/** Verbatim: scan forward for the next segment that actually has exercises. */
export function findNextValidSegment(
  segments: WorkoutSegment[],
  startIndex: number,
  getExercises: AdvanceContext['getExercises'],
): number | null {
  for (let i = startIndex; i < segments.length; i++) {
    const exercises = getExercises(segments[i]);
    if (exercises && exercises.length > 0) return i;
  }
  return null;
}

/** Segment end → next segment or workout complete (shared tail of every path). */
function advanceOutOfSegment(ctx: AdvanceContext): AdvanceDecision {
  const nextIdx = findNextValidSegment(ctx.segments, ctx.currentSegmentIndex + 1, ctx.getExercises);
  if (nextIdx !== null) {
    const nextSeg = ctx.segments[nextIdx];
    const nextExercises = ctx.getExercises(nextSeg);
    const nextFirst = nextExercises?.[0];
    const nextFirstPaired = (nextFirst as AdvanceExercise | undefined)?.pairedWith ?? 'NONE';
    console.log(
      `[Engine] ↪ Advancing to segment ${nextIdx} ("${(nextSeg as { title?: string })?.title ?? 'untitled'}") — ` +
      `first exercise="${nextFirst?.name ?? '?'}" pairedWith=${nextFirstPaired}`,
    );
    return { kind: 'nextSegment', segmentIndex: nextIdx };
  }
  return { kind: 'workoutComplete' };
}

export function computeAdvanceDecision(ctx: AdvanceContext): AdvanceDecision {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, log, getExercises, getSets } = ctx;

  const currentSeg = segments[currentSegmentIndex];
  const exercises = getExercises(currentSeg);

  if (!exercises || exercises.length === 0) {
    return advanceOutOfSegment(ctx);
  }

  const currentEx = exercises[prevExerciseIndex];
  const setsForCurrentEx = getSets(currentEx);

  // ── Superset Flow ────────────────────────────────────────────────────────
  const pairedId = currentEx?.pairedWith;

  console.log(
    `[Engine][moveToNext] seg=${currentSegmentIndex} ex[${prevExerciseIndex}]="${currentEx?.name}" ` +
    `pairedWith=${pairedId ?? 'NONE'} setIdx=${setIdx}`,
  );

  if (pairedId) {
    const pairedIndex = exercises.findIndex((e) => e.id === pairedId);

    if (pairedIndex === -1) {
      // Partner not found in this segment — warn and fall through to straight.
      console.warn(
        `[Engine][Superset] ⚠️ "${currentEx?.name}" has pairedWith="${pairedId}" ` +
        `but no exercise with that id was found in segment ${currentSegmentIndex}. ` +
        `Segment exercises: [${exercises.map((e) => `${e.name}(${e.id})`).join(', ')}]. ` +
        `Falling back to straight sets — check that both paired exercises share the same exerciseRole.`,
      );
    } else {
      // Equalize round count to Math.max(A.sets, B.sets) — mirrors the
      // playlist's equalizedSets so the engine terminates after the same
      // number of rounds the UI renders pills for.
      const pairedPartner = exercises[pairedIndex];
      const effectiveSets = Math.max(setsForCurrentEx, getSets(pairedPartner));

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
    }
  }

  // ── Straight Sets (default; pyramid steps ride this path) ────────────────
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
}
