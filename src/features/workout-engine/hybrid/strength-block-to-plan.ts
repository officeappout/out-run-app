/**
 * strength-block-to-plan — adapter: StrengthBlockResult → WorkoutPlan (Phase 3c).
 *
 * StrengthRunner consumes a parks `WorkoutPlan` (route.types) with 'station'
 * segments of enriched parks `Exercise`. The generator emits `WorkoutExercise`
 * (generator type) wrapping a CONTENT `Exercise` + a prescription (sets / reps /
 * rest / isTimeBased). This maps one block → one single-station WorkoutPlan.
 *
 * LOCAL + MINIMAL — no dependency on the protocol-blocks branch's mapper. Pure:
 * all imports are type-only (erased at runtime).
 */

import type { WorkoutExercise as GeneratedExercise } from '../logic/workout-generator.types';
import type { StrengthBlockResult } from '../core/pipeline/strength-block.service';
import type {
  WorkoutPlan,
  WorkoutSegment,
  Exercise as PlanExercise,
} from '@/features/parks/core/types/route.types';

/** Localized name off the content exercise (Firestore doc shape — dynamic access). */
function exName(we: GeneratedExercise): string {
  const ex = we.exercise as any;
  return ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? 'תרגיל';
}

function exMedia(we: GeneratedExercise): { videoUrl?: string; imageUrl?: string } {
  const ex = we.exercise as any;
  const videoUrl: string | undefined = ex?.media?.videoUrl ?? ex?.media?.mainVideoUrl ?? undefined;
  const imageUrl: string | undefined = ex?.media?.imageUrl ?? videoUrl ?? undefined;
  return { ...(videoUrl ? { videoUrl } : {}), ...(imageUrl ? { imageUrl } : {}) };
}

/** Display "3×8-12 חזרות" / "3×45 שניות" from the prescription. */
function prescriptionLabel(we: GeneratedExercise): { reps?: string; duration?: string } {
  const setsPrefix = we.sets ? `${we.sets}×` : '';
  const r = we.repsRange;
  const core = r ? (r.min !== r.max ? `${r.min}-${r.max}` : `${r.min}`) : `${we.reps}`;
  return we.isTimeBased
    ? { duration: `${setsPrefix}${core} שניות` }
    : { reps: `${setsPrefix}${core} חזרות` };
}

/** One generator exercise → one enriched parks Exercise (conditional spread). */
function toPlanExercise(we: GeneratedExercise): PlanExercise {
  const { reps, duration } = prescriptionLabel(we);
  return {
    id: we.exercise.id,
    name: exName(we),
    exerciseRole: 'main',
    exerciseType: we.isTimeBased ? 'time' : 'reps',
    isTimeBased: we.isTimeBased,
    sets: we.sets,
    restSeconds: we.restSeconds,
    ...(we.repsRange ? { repsRange: we.repsRange } : {}),
    ...(reps ? { reps } : {}),
    ...(duration ? { duration } : {}),
    ...(we.isGoalExercise ? { isGoalExercise: true } : {}),
    ...(we.rampedTarget != null ? { rampedTarget: we.rampedTarget } : {}),
    ...exMedia(we),
  };
}

export interface StrengthBlockPlanOptions {
  id?: string;
  name?: string;
  location?: WorkoutPlan['workoutLocation'];
}

/**
 * Wrap a strength block as a single-station WorkoutPlan for StrengthRunner.
 * Straight sets only (blocks force straight sets — no appliedProtocol).
 * `isWarmupActive:false` — the surrounding aerobic leg is the warm-up.
 */
export function strengthBlockToWorkoutPlan(
  block: StrengthBlockResult,
  options: StrengthBlockPlanOptions = {},
): WorkoutPlan {
  const exercises = block.exercises.map(toPlanExercise);
  const segment: WorkoutSegment = {
    id: 'hybrid-station',
    type: 'station',
    title: options.name ?? 'תחנת כוח',
    icon: '💪',
    target: { type: 'reps', value: 12 },
    exercises,
    isCompleted: false,
    restBetweenExercises: 10,
  };
  return {
    id: options.id ?? 'hybrid-station-plan',
    name: options.name ?? 'תחנת כוח',
    segments: [segment],
    totalDuration: Math.round((block.estimatedDurationSec ?? 0) / 60) || 10,
    difficulty: 'medium',
    trainingType: 'strength',
    workoutLocation: options.location ?? 'park',
    isWarmupActive: false,
  };
}
