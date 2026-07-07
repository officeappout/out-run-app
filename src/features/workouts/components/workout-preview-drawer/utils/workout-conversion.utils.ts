/**
 * Workout-plan conversion utilities for WorkoutPreviewDrawer.
 *
 * Bridges between two data shapes:
 *   • Raw `FirestoreExercise[]`  → legacy `WorkoutPlan` (warmup / strength / cooldown segments).
 *   • Drawer-level `WorkoutData` → legacy `WorkoutPlan` (segment-by-segment translation).
 *
 * Both functions live here so the orchestrator can stay focused on
 * UI state and these heavy transforms are tree-shakeable / testable
 * in isolation.
 */
import {
  WorkoutPlan,
  WorkoutSegment as ParkWorkoutSegment,
  Exercise as WorkoutExercise,
} from '@/features/parks';
import {
  Exercise as FirestoreExercise,
  getLocalizedText,
  findMethodForLocation,
} from '@/features/content/exercises';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { WorkoutData } from '../types';

/**
 * Convert Firestore exercises to WorkoutPlan format.
 * Organizes exercises into segments: Warm-up, Strength, Cool-down.
 */
export async function convertExercisesToWorkoutPlan(
  exercises: FirestoreExercise[],
): Promise<WorkoutPlan> {
  const mergeEquipment = (ex: FirestoreExercise): string[] => {
    const method = findMethodForLocation(ex, 'home') ?? ex.execution_methods?.[0];
    const raw = [
      ...((method as any)?.gearIds || []),
      ...((method as any)?.equipmentIds || []),
      ...((method as any)?.gearId ? [(method as any).gearId] : []),
      ...((method as any)?.equipmentId ? [(method as any).equipmentId] : []),
    ].filter(Boolean);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of raw) {
      const norm = normalizeGearId(id);
      if (norm !== 'none' && norm !== 'bodyweight' && !seen.has(norm)) {
        seen.add(norm);
        result.push(norm);
      }
    }
    return result;
  };

  const warmupExercises = exercises.filter((ex) => ex.exerciseRole === 'warmup');
  const mainExercises = exercises.filter((ex) => ex.exerciseRole === 'main' || !ex.exerciseRole);
  const cooldownExercises = exercises.filter((ex) => ex.exerciseRole === 'cooldown');

  const segments: ParkWorkoutSegment[] = [];

  const resolveImageUrl = (ex: FirestoreExercise): string | undefined => {
    const method = findMethodForLocation(ex, 'home') ?? ex.execution_methods?.[0];
    const { imageUrl } = resolveExerciseMedia(ex as any, method as any);
    return imageUrl;
  };

  // Warm-up segment
  if (warmupExercises.length > 0) {
    const warmupWorkoutExercises: WorkoutExercise[] = warmupExercises.map((ex) => {
      const executionMethod = findMethodForLocation(ex, 'home') ?? ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      let targetType: 'time' | 'reps' = 'time';
      let targetValue = 60;
      let reps: string | undefined;
      let duration: string | undefined;

      if (ex.type === 'time') {
        targetType = 'time';
        targetValue = ex.secondsPerRep ? ex.secondsPerRep * 10 : 60;
        duration = `${targetValue} שניות`;
      } else if (ex.type === 'reps') {
        targetType = 'reps';
        targetValue = 10;
        reps = '10 חזרות';
      } else {
        duration = '5 דקות';
      }

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        reps,
        duration,
        videoUrl: mainVideoUrl,
        imageUrl,
        fullTutorial: resolveExerciseMedia(ex as any, executionMethod as any).fullTutorial,
        instructions: ex.content?.highlights || [],
        icon: '🔥',
        equipment: mergeEquipment(ex),
      };
    });

    segments.push({
      id: 'warmup-segment',
      type: 'station',
      title: 'חימום',
      icon: '🔥',
      target: {
        type: 'time',
        value: warmupExercises.reduce((sum, ex) => {
          if (ex.type === 'time' && ex.secondsPerRep) {
            return sum + ex.secondsPerRep * 10;
          }
          return sum + 60;
        }, 0),
      },
      exercises: warmupWorkoutExercises,
      isCompleted: false,
    });
  }

  // Strength segment(s)
  if (mainExercises.length > 0) {
    const strengthWorkoutExercises: WorkoutExercise[] = mainExercises.map((ex) => {
      const executionMethod = findMethodForLocation(ex, 'home') ?? ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      let targetType: 'time' | 'reps' = 'reps';
      let targetValue = 12;
      let reps: string | undefined;
      let duration: string | undefined;

      if (ex.type === 'time') {
        targetType = 'time';
        targetValue = ex.secondsPerRep ? ex.secondsPerRep * 10 : 45;
        duration = `${targetValue} שניות`;
      } else if (ex.type === 'reps') {
        targetType = 'reps';
        targetValue = 12;
        reps = '12 חזרות';
      }

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        reps,
        duration,
        videoUrl: mainVideoUrl,
        imageUrl,
        fullTutorial: resolveExerciseMedia(ex as any, executionMethod as any).fullTutorial,
        instructions: ex.content?.highlights || [],
        icon: '💪',
        equipment: mergeEquipment(ex),
      };
    });

    segments.push({
      id: 'strength-segment',
      type: 'station',
      title: 'תרגילי כוח',
      icon: '💪',
      target: {
        type: mainExercises[0]?.type === 'time' ? 'time' : 'reps',
        value: mainExercises[0]?.type === 'time' ? 45 : 12,
      },
      exercises: strengthWorkoutExercises,
      isCompleted: false,
    });
  }

  // Cool-down segment
  if (cooldownExercises.length > 0) {
    const cooldownWorkoutExercises: WorkoutExercise[] = cooldownExercises.map((ex) => {
      const executionMethod = findMethodForLocation(ex, 'home') ?? ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        duration: '5 דקות',
        videoUrl: mainVideoUrl,
        imageUrl,
        fullTutorial: resolveExerciseMedia(ex as any, executionMethod as any).fullTutorial,
        instructions: ex.content?.highlights || [],
        icon: '🧘',
        equipment: mergeEquipment(ex),
      };
    });

    segments.push({
      id: 'cooldown-segment',
      type: 'station',
      title: 'קירור',
      icon: '🧘',
      target: {
        type: 'time',
        value: cooldownExercises.length * 60,
      },
      exercises: cooldownWorkoutExercises,
      isCompleted: false,
    });
  }

  // Rough total-duration estimate.
  const totalDuration = segments.reduce((sum, seg) => {
    if (seg.target.type === 'time') {
      return sum + seg.target.value;
    }
    // For reps, estimate 3 seconds per rep
    return sum + seg.target.value * 3;
  }, 0);

  return {
    id: 'real-workout-' + Date.now(),
    name: 'אימון כוח',
    segments,
    totalDuration: Math.ceil(totalDuration / 60),
    difficulty: 'medium' as const,
  };
}

/**
 * Convert a drawer-level WorkoutData prop into a legacy WorkoutPlan
 * structure so StrengthOverviewCard / the active-workout player can
 * consume it.
 */
export function convertWorkoutDataToPlan(workoutData: WorkoutData): WorkoutPlan {
  const segments: ParkWorkoutSegment[] = workoutData.segments.map((segment) => {
    let targetType: 'distance' | 'time' | 'reps' = 'time';
    let targetValue = 30;

    if (segment.repsOrDuration) {
      if (segment.repsOrDuration.includes('חזרות') || segment.repsOrDuration.includes('reps')) {
        targetType = 'reps';
        const match = segment.repsOrDuration.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) : 10;
      } else if (segment.repsOrDuration.includes('שניות') || segment.repsOrDuration.includes('seconds')) {
        targetType = 'time';
        const match = segment.repsOrDuration.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) : 30;
      } else if (segment.durationOrDistance) {
        targetType = 'time';
        const match = segment.durationOrDistance.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) * 60 : 300;
      }
    }

    return {
      id: segment.id,
      type: (segment.type === 'strength' ? 'station' : 'travel') as 'station' | 'travel',
      title: segment.title,
      subTitle: segment.repsOrDuration || segment.durationOrDistance,
      icon: segment.imageUrl || '💪',
      target: {
        type: targetType,
        value: targetValue,
      },
      exercises: segment.type === 'strength' ? [
        {
          id: `${segment.id}-exercise`,
          name: segment.title,
          reps: segment.repsOrDuration?.includes('חזרות') ? segment.repsOrDuration : undefined,
          duration: segment.repsOrDuration?.includes('שניות') ? segment.repsOrDuration : undefined,
          videoUrl: segment.imageUrl || undefined,
        },
      ] : undefined,
      isCompleted: false,
    };
  });

  return {
    id: workoutData.id,
    name: workoutData.title,
    segments,
    totalDuration: (workoutData.duration || 45) * 60,
    difficulty: (workoutData.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
  };
}
