/**
 * segment-chain — the block-chaining loop shared by EVERY advance head
 * (protocol-blocks Stage 1b, 11.07.2026).
 *
 * When a head finishes its segment it calls advanceOutOfSegment; the chain
 * scans forward for the next segment with content or declares the workout
 * complete. Block-scoped heads (tabata/emom/amrap, Stages 2-3) reuse this
 * exact tail — do not duplicate the scan inside a strategy.
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
export function advanceOutOfSegment(ctx: AdvanceContext): AdvanceDecision {
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
