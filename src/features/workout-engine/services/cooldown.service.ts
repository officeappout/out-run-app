/**
 * Cooldown Service
 *
 * Appends 2-3 mandatory cooldown (static stretch) exercises to a generated
 * workout. Uses a multi-tier fallback: strict bodyweight -> any location
 * match -> absolute "nuke" fallback ignoring equipment and location.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { ContextualFilterContext } from '../logic/ContextualEngine';
import type { GeneratedWorkout } from '../logic/WorkoutGenerator';
import { isWarmupEquipmentAllowed } from './warmup.service';

// ============================================================================
// COOLDOWN APPEND
// ============================================================================

/**
 * True Cooldown: exerciseRole === 'cooldown' (static stretches).
 * Bulletproof: if strict bodyweight filter yields 0, fallback to ANY cooldown for location.
 */
export function appendCooldownExercises(
  workout: GeneratedWorkout,
  allExercises: Exercise[],
  filterContext: ContextualFilterContext,
  location: ExecutionLocation,
): void {
  const usedMuscles = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exercise.primaryMuscle) usedMuscles.add(ex.exercise.primaryMuscle);
  }

  const workoutIds = new Set(workout.exercises.map(e => e.exercise.id));

  // Step 1: Find ALL exercises with exerciseRole === 'cooldown'
  const allCooldowns = allExercises.filter(ex => ex.exerciseRole === 'cooldown');

  // Step 2: Filter by location OR fallback to home
  const withLocation = allCooldowns.filter(ex => {
    if (workoutIds.has(ex.id)) return false;
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = methods.find(
      m => m.location === location || m.location === 'home' || m.locationMapping?.includes(location),
    );
    return !!method;
  });

  // Debug: log all cooldown candidates and rejection reasons
  console.group('[Cooldown] Candidate audit');
  for (const ex of allCooldowns) {
    const name = typeof ex.name === 'string' ? ex.name : (ex.name as any)?.he || ex.id;
    const reasons: string[] = [];
    if (workoutIds.has(ex.id)) reasons.push('already in workout');
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = methods.find(m => m.location === location || m.location === 'home' || m.locationMapping?.includes(location));
    if (!method) reasons.push('no method for location');
    else {
      const gearIds = (method.gearIds ?? method.gearId ? [method.gearId] : []) as (string | undefined)[];
      const equipmentIds = (method.equipmentIds ?? method.equipmentId ? [method.equipmentId] : []) as (string | undefined)[];
      if (!isWarmupEquipmentAllowed(gearIds, equipmentIds)) reasons.push('equipment mismatch (bands/TRX)');
    }
    console.log(`  ${ex.id} "${name}": ${reasons.length ? reasons.join('; ') : 'OK'}`);
  }
  console.groupEnd();

  // Step 3: Strict bodyweight first; if 0 candidates, fallback to ANY cooldown for location
  let cooldownCandidates = withLocation.filter(ex => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = methods.find(m => m.location === location || m.location === 'home' || m.locationMapping?.includes(location));
    if (!method) return false;
    const gearIds = method.gearIds ?? method.gearId ? [method.gearId] : [];
    const equipmentIds = method.equipmentIds ?? method.equipmentId ? [method.equipmentId] : [];
    return isWarmupEquipmentAllowed(gearIds, equipmentIds);
  });

  if (cooldownCandidates.length === 0) {
    console.log('[Cooldown] Strict bodyweight yielded 0 candidates → fallback to ANY cooldown for location');
    cooldownCandidates = withLocation;
  }

  // Absolute Fallback: if still 0, grab ANY exerciseRole cooldown OR flexibility — ignore equipment & location
  if (cooldownCandidates.length === 0) {
    const nukePool = allExercises.filter((ex) => {
      if (workoutIds.has(ex.id)) return false;
      return ex.exerciseRole === 'cooldown' || (ex.tags as string[] ?? []).includes('flexibility');
    });
    if (nukePool.length > 0) {
      console.log('[Cooldown] Absolute fallback: using', nukePool.length, 'exercises (ignoring equipment/location)');
      cooldownCandidates = nukePool.slice(0, 2);
    }
  }

  // Score: +2 if muscle matches, +1 if has video
  const scored = cooldownCandidates.map(ex => {
    let score = 0;
    if (ex.primaryMuscle && usedMuscles.has(ex.primaryMuscle)) score += 2;
    const methods = ex.execution_methods || ex.executionMethods || [];
    let bestMethod = methods.find(m => m.location === location) || methods.find(m => m.location === 'home') || methods[0];
    // Absolute fallback: exercises from nuke pool may have no methods — use minimal placeholder
    if (!bestMethod) {
      bestMethod = {
        location: 'home',
        requiredGearType: 'none',
        media: {},
      } as any;
    }
    if (bestMethod?.media?.mainVideoUrl) score += 1;
    return { exercise: ex, method: bestMethod, score };
  });

  // Sort by score descending, pick 2-3
  scored.sort((a, b) => b.score - a.score);
  const targetCount = Math.min(3, Math.max(2, scored.length));
  const selected = scored.slice(0, targetCount);

  // Convert to WorkoutExercise format and append
  for (const item of selected) {
    if (!item.method) continue;

    const cooldownExercise = {
      exercise: item.exercise,
      method: {
        exercise: item.exercise,
        method: item.method,
        score: item.score,
        reasoning: ['cooldown: muscle match'],
        mechanicalType: item.exercise.mechanicalType || 'none' as const,
      }.method,
      mechanicalType: (item.exercise.mechanicalType || 'none') as any,
      sets: 1,
      reps: item.exercise.type === 'time' ? 30 : 10,
      isTimeBased: item.exercise.type === 'time',
      restSeconds: 0,
      priority: 'isolation' as const,
      score: item.score,
      reasoning: ['mandatory cooldown — muscle match'],
      exerciseRole: 'cooldown' as const,
    };

    workout.exercises.push(cooldownExercise);
  }
}
