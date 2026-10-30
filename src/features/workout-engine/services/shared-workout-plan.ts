/**
 * Rebuild a GeneratedWorkout from a shared-workout document
 * (`sharedWorkouts/{id}`, written by share.service.ts) so the shared link can render the SAME
 * preview list component as the in-app strength preview (GeneratedWorkoutExerciseList).
 *
 * The shared doc keeps only a stripped view of each exercise (name, sets, reps, role, pairing,
 * one image / video, a few text fields). Everything the list needs to show is rebuilt; engine
 * internals (scoring, tiers, protocols) are filled with neutral values. Returns null when the
 * doc lacks usable data — the caller then keeps the current shared-page layout.
 */
import type { GeneratedWorkout, WorkoutExercise } from '../logic/WorkoutGenerator';
import type { SharedExercise, SharedWorkoutDoc } from './share.service';

type SharedDocLike = Pick<SharedWorkoutDoc, 'title' | 'description' | 'titleLocalized' | 'descriptionLocalized' | 'difficulty' | 'estimatedDuration' | 'totalPlannedSets' | 'isRecovery' | 'structure'> & {
  exercises?: SharedExercise[] | null;
  equipment?: string[] | null;
};

const asDifficulty = (n: unknown): 1 | 2 | 3 => (n === 1 || n === 3 ? n : 2);

function toWorkoutExercise(ex: SharedExercise, equipment: string[]): WorkoutExercise {
  const role = ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown' ? ex.exerciseRole : 'main';
  const exercise = {
    id: ex.exerciseId,
    name: ex.name,
    type: ex.isTimeBased ? 'time' : 'reps',
    exerciseRole: role,
    primaryMuscle: ex.primaryMuscle ?? undefined,
    secondaryMuscles: ex.secondaryMuscles ?? undefined,
    symmetry: ex.symmetry ?? undefined,
    movementGroup: ex.movementGroup ?? undefined,
    media: { imageUrl: ex.imageUrl ?? undefined, videoUrl: ex.videoUrl ?? undefined, mainVideoUrl: ex.videoUrl ?? undefined },
    content: {
      instructions: ex.instructions ?? undefined,
      description: ex.description ?? undefined,
      specificCues: ex.specificCues ?? undefined,
      goal: ex.goal ?? undefined,
      notes: ex.notes ?? undefined,
      highlights: ex.highlights ?? undefined,
    },
  };
  const method = {
    media: { imageUrl: ex.imageUrl ?? undefined, mainVideoUrl: ex.videoUrl ?? undefined, videoUrl: ex.videoUrl ?? undefined },
    gearIds: equipment,
    equipmentIds: [] as string[],
    specificCues: ex.methodCues ?? undefined,
    highlights: ex.methodHighlights ?? undefined,
  };
  return {
    exercise,
    method,
    mechanicalType: 'straight_arm',
    sets: ex.sets || 1,
    reps: ex.reps || 0,
    repsRange: ex.repsRange ?? undefined,
    isTimeBased: !!ex.isTimeBased,
    restSeconds: ex.restSeconds ?? 0,
    priority: 'accessory',
    score: 0,
    reasoning: [],
    exerciseRole: role,
    pairedWith: ex.pairedWith ?? undefined,
  } as unknown as WorkoutExercise;
}

/** Null = not enough data (no exercises, or one without id / name): keep the old layout. */
export function sharedDocToGeneratedWorkout(doc: SharedDocLike | null | undefined): GeneratedWorkout | null {
  const list = doc?.exercises;
  if (!doc || !Array.isArray(list) || list.length === 0) return null;
  if (list.some((e) => !e || !e.exerciseId || !e.name)) return null;
  const equipment = Array.isArray(doc.equipment) ? doc.equipment.filter(Boolean) : [];
  const exercises = list.map((e) => toWorkoutExercise(e, equipment));
  return {
    title: doc.title || '',
    description: doc.description || '',
    ...(doc.titleLocalized ? { titleLocalized: doc.titleLocalized } : {}),
    ...(doc.descriptionLocalized ? { descriptionLocalized: doc.descriptionLocalized } : {}),
    exercises,
    estimatedDuration: doc.estimatedDuration ?? 0,
    structure: (doc.structure || 'standard') as GeneratedWorkout['structure'],
    difficulty: asDifficulty(doc.difficulty) as GeneratedWorkout['difficulty'],
    mechanicalBalance: {} as GeneratedWorkout['mechanicalBalance'],
    stats: {} as GeneratedWorkout['stats'],
    isRecovery: !!doc.isRecovery,
    totalPlannedSets: doc.totalPlannedSets ?? exercises.reduce((s, e) => s + e.sets, 0),
  } as GeneratedWorkout;
}
