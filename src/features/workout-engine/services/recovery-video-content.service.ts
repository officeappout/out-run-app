/**
 * recovery-video-content.service — rest-day recovery-video fast path (25.08.2026).
 *
 * Extracted from home-workout.service.ts's tryBuildRecoveryVideoTrio so the two pieces that
 * genuinely matter for a future rest-day Generator (a targeted content query, and building one
 * HomeWorkoutResult from one recovery Exercise) are reusable on their own — not buried inside a
 * function shaped around "always exactly 3, padded if fewer." Per the 17.8 build-plan's Section
 * 4 addendum: rest days should eventually surface multiple real generator-produced suggestions
 * (recovery video, light mobility, light cardio, ...), the same way training days already do
 * with one card per generator. Nothing here wires into GENERATOR_REGISTRY yet — that's future
 * work, tracked separately — but both exports below are shaped so a real
 * recovery-video.generator.ts could call them directly with no rework.
 *
 * Performance motivation (measured, not estimated — David's own console run via genPerfMark):
 * a rest-day home load costs ~2414ms/19 Firestore reads today, because generateHomeWorkoutTrio
 * always runs the full shared pipeline (getAllExercises with zero `where`, budget resolution,
 * protocol/goal scoring, history) BEFORE it even checks whether a tagged recovery video exists.
 * Confirmed directly: the video path (tryBuildRecoveryVideoTrio) and the Budget-Floor recovery
 * path (generateRecoveryWorkout) both ignore that scored-pool output entirely — it's computed
 * and discarded either way. queryRestDayRecoveryVideos below runs FIRST, with a targeted
 * Firestore query instead of a full collection scan. The ~980ms schedule-resolution step still
 * has to run (a genuine prerequisite for scheduledProgramIds' program-affinity filter, and paid
 * separately by other home-screen consumers regardless of this fast path — confirmed
 * AgendaDayCard calls the same schedule fetch independently, no shared cache) — everything
 * AFTER it in the old pipeline is what becomes skippable. Realistic target: ~2414ms ->
 * ~1050-1100ms, not "instant" — still a genuine ~55% cut when a tagged video exists.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeExercise } from '@/features/content/exercises/services/exercise-mapping.utils';
import type { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { LifestylePersona } from '../logic/ContextualEngine';
import type { GeneratedWorkout, WorkoutExercise, DifficultyLevel } from '../logic/WorkoutGenerator';
import type { HomeWorkoutResult } from './home-workout.types';
import type { TimeOfDay } from './workout-metadata.service';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';

// Matches exercise.service.ts's own (unexported) EXERCISES_COLLECTION constant — inlined here
// rather than exporting that constant just for this one shared literal.
const EXERCISES_COLLECTION = 'exercises';

/**
 * Targeted rest-day recovery-video query. Replaces tryBuildRecoveryVideoTrio's own
 * getAllExercises()-then-filter approach — same exerciseRole/showOnRestDays filter, but as a
 * real Firestore `where`, not a client-side scan of the entire exercises collection.
 * Program-affinity narrowing (strict match on restDayProgramIds first, broad fallback if none
 * match) stays client-side exactly like the old function, but now against this query's small
 * result set instead of the whole collection.
 *
 * Returns every qualifying exercise, unpadded (0, 1, 2, or N) — NOT limited/padded to 3. The
 * old "always exactly 3, pad with the last one" shape is a UI-contract concern for the legacy
 * WorkoutSelectionCarousel, not something this data-fetching layer should bake in.
 */
export async function queryRestDayRecoveryVideos(
  scheduledProgramIds: string[] = [],
): Promise<Exercise[]> {
  const q = query(
    collection(db, EXERCISES_COLLECTION),
    where('exerciseRole', '==', 'recovery'),
    where('showOnRestDays', '==', true),
  );
  const snapshot = await getDocs(q);
  const pool = snapshot.docs.map((docSnap) => normalizeExercise(docSnap.id, docSnap.data()));

  if (scheduledProgramIds.length === 0) return pool;
  const programMatched = pool.filter((ex) =>
    (ex.restDayProgramIds ?? []).some((id) => scheduledProgramIds.includes(id)),
  );
  return programMatched.length > 0 ? programMatched : pool;
}

export interface RecoveryVideoWorkoutContext {
  location: ExecutionLocation;
  daysInactive: number;
  persona: LifestylePersona | null;
  timeOfDay: TimeOfDay;
}

/**
 * Builds one HomeWorkoutResult from one recovery Exercise. Extracted verbatim (mapping logic
 * unchanged) from tryBuildRecoveryVideoTrio's per-exercise trio-option construction
 * (home-workout.service.ts) — the piece a future recovery-video.generator.ts's generate()
 * would call directly, once one exists.
 */
export function buildRecoveryVideoWorkoutResult(
  exercise: Exercise,
  context: RecoveryVideoWorkoutContext,
  poolSize: number,
): HomeWorkoutResult {
  const { location, daysInactive, persona, timeOfDay } = context;
  // Rest-day recovery videos are location-agnostic stretches; prefer the location-correct
  // method, keep the [0] fallback (cosmetic which-video) — same reasoning as the extraction
  // source.
  const method = (CONTEXT_AWARE_SELECTION_ENABLED
    ? selectMethodForContext(exercise, location, [])
    : null) ?? exercise.execution_methods?.[0] ?? (exercise as any).executionMethods?.[0] ?? {};
  const durationSeconds = (method as any)?.media?.videoDurationSeconds ?? null;
  const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : 10;

  const exName = exercise.name;
  const title = typeof exName === 'object'
    ? ((exName as any).he || (exName as any).en || '')
    : String(exName ?? '');

  const workoutExercise: WorkoutExercise = {
    exercise,
    method: method as any,
    mechanicalType: (exercise.mechanicalType || 'none') as any,
    sets: 1,
    reps: 1,
    repsRange: { min: 1, max: 1 },
    isTimeBased: true,
    restSeconds: 0,
    priority: 'isolation' as const,
    score: 0,
    reasoning: ['recovery_video_rest_day'],
    programLevel: 1,
    isOverLevel: false,
    tier: 'flow' as const,
    levelDelta: 0,
    isGoalExercise: false,
    exerciseRole: 'main' as const,
  };

  const workout: GeneratedWorkout = {
    title,
    description: '',
    exercises: [workoutExercise],
    estimatedDuration: durationMin,
    structure: 'standard',
    difficulty: 1 as DifficultyLevel,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: true,
    totalPlannedSets: 1,
    pipelineLog: ['recovery_video_rest_day'],
  };

  return {
    workout,
    meta: {
      daysInactive,
      persona,
      location,
      timeOfDay,
      injuryAreas: [],
      exercisesConsidered: poolSize,
      exercisesExcluded: 0,
    },
  };
}
