/**
 * enable_swap_fixes_v1 — a hybrid overview swap on ONE pyramid step replaces only that step
 * (the old path swapped the whole parent and left the steps showing the old name / image).
 * Same metric rule as the preview's step swap: the step's rep count is the shape; a time-based
 * variant turns it into seconds with the engine's TUT multiplier (2.5×).
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import { getLocalizedText } from '@/features/content/exercises';
import { isTimeBasedExercise } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';

const TUT_REPS_TO_SECONDS = 2.5; // = pyramid.processor.ts / useExerciseSwap

export interface PyramidStepLike {
  exerciseId: string;
  name: string;
  targetReps?: number;
  targetHold?: number;
  imageUrl?: string;
  videoSrc?: string;
  level?: number;
  isSwapped?: boolean;
}

export function swapPyramidStep<S extends PyramidStepLike>(
  seq: readonly S[],
  stepIndex: number,
  newExercise: Exercise,
  method: ExecutionMethod | null | undefined,
  newLevel?: number,
): S[] {
  const step = seq[stepIndex];
  if (!step) return seq.slice();
  const shapeRep =
    step.targetReps != null
      ? step.targetReps
      : step.targetHold != null
        ? Math.round(step.targetHold / TUT_REPS_TO_SECONDS)
        : 0;
  const timeBased = (newExercise as { metric?: string }).metric === 'hold' || isTimeBasedExercise(newExercise);
  const { imageUrl, videoUrl } = resolveExerciseMedia(newExercise as any, method as any);
  const next: S = {
    ...step,
    exerciseId: newExercise.id,
    name: getLocalizedText(newExercise.name, 'he'),
    imageUrl,
    videoSrc: videoUrl,
    isSwapped: true,
    ...(typeof newLevel === 'number' ? { level: newLevel } : {}),
    ...(timeBased
      ? { targetHold: Math.round(shapeRep * TUT_REPS_TO_SECONDS), targetReps: undefined }
      : { targetReps: shapeRep, targetHold: undefined }),
  };
  return seq.map((s, i) => (i === stepIndex ? next : s));
}
