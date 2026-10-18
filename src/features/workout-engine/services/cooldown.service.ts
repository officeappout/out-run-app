/**
 * Cooldown Service
 *
 * Appends 1-3 cooldown (static stretch) exercises to a generated workout.
 * Tiers (test / placeholder docs are excluded from ALL of them — H5):
 *   1. exerciseRole 'cooldown', bodyweight method at this location
 *   2. exerciseRole 'cooldown', any method at this location
 *   3. bodyweight stretch fallback: flexibility-tagged / movementGroup 'flexibility'
 *      docs, then the untagged stretch videos ("מתיחת …", no role — the catalog's
 *      unreachable-warmup-stretch list) with a bodyweight method at this location
 *   4. nothing → the cooldown block is OMITTED. A test item or a method-less
 *      placeholder is never shown (the old "nuke" fallback did both).
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { ContextualFilterContext } from '../logic/ContextualEngine';
import type { GeneratedWorkout } from '../logic/WorkoutGenerator';
import { isWarmupEquipmentAllowed } from './warmup.service';
import { cooldownCountBudget } from '../logic/session-frame.utils';
import { isTimeBasedExercise } from '../logic/workout-budgeting.utils';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';

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
  /**
   * Session time budget (minutes) — cooldown is part of the user's budget
   * (product decision 10.07.2026): <20min → 1 stretch, 20-39 → 2, 40+ → 3.
   * Omitted → 2 (today's typical output).
   */
  availableTimeMin?: number,
): void {
  const usedMuscles = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exercise.primaryMuscle) usedMuscles.add(ex.exercise.primaryMuscle);
  }

  const workoutIds = new Set(workout.exercises.map(e => e.exercise.id));

  // Step 1: Find ALL real exercises with exerciseRole === 'cooldown'.
  // The live catalog's ONLY cooldown doc is a test item ("…לבדיקה", 05-BENCHMARK
  // §6.4 #1) — it is excluded here and in every tier below.
  const allCooldowns = allExercises.filter(ex => ex.exerciseRole === 'cooldown' && !isTestOrPlaceholderExercise(ex));

  // Step 2: Filter by location OR fallback to home
  const withLocation = allCooldowns.filter(ex => {
    if (workoutIds.has(ex.id)) return false;
    if (CONTEXT_AWARE_SELECTION_ENABLED) {
      // Single-source eligibility: at a park a home-only stretch is NOT admitted
      // (selector returns null), so it can never be stamped with a home method.
      return selectMethodForContext(ex, location, filterContext.availableEquipment ?? []) != null;
    }
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

  // Tier 3 — bodyweight stretch fallback (location-aware, never a placeholder method).
  let fromStretchFallback = false;
  if (cooldownCandidates.length === 0) {
    cooldownCandidates = stretchFallbackPool(allExercises, workoutIds, location, filterContext);
    fromStretchFallback = cooldownCandidates.length > 0;
    console.log(`[Cooldown] No real cooldown-role exercise → stretch fallback: ${cooldownCandidates.length} candidates`);
  }
  // Tier 4 — nothing real: omit the block rather than show a test item.
  if (cooldownCandidates.length === 0) {
    console.log('[Cooldown] No valid cooldown or stretch for this location → cooldown omitted');
    return;
  }
  const workoutAreas = mainAreas(workout);

  // Score: +2 if muscle matches, +1 if has video, +1 stretch area matches the session
  const scored = cooldownCandidates.map(ex => {
    let score = 0;
    if (ex.primaryMuscle && usedMuscles.has(ex.primaryMuscle)) score += 2;
    if (fromStretchFallback && workoutAreas.has(stretchArea(ex))) score += 1;
    const methods = ex.execution_methods || ex.executionMethods || [];
    const bestMethod = CONTEXT_AWARE_SELECTION_ENABLED
      ? selectMethodForContext(ex, location, filterContext.availableEquipment ?? [])
      : (methods.find(m => m.location === location || m.locationMapping?.includes(location)) ||
         methods.find(m => m.location === 'home' || m.locationMapping?.includes('home')) ||
         methods[0]);
    if (bestMethod?.media?.mainVideoUrl) score += 1;
    return { exercise: ex, method: bestMethod, score, tiebreak: Math.random() };
  });

  // Sort by score descending, pick per the session's time budget
  // (<20min → 1 · 20-39 → 2 · 40+ → 3; omitted → 2).
  scored.sort((a, b) => b.score - a.score || a.tiebreak - b.tiebreak);
  const targetCount = Math.min(cooldownCountBudget(availableTimeMin), Math.max(1, scored.length));
  const selected = scored.filter(item => !!item.method).slice(0, targetCount);

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
      // Single source of truth (docs/workout-engine/06-TIME-VS-REPS.md): this
      // used to check only `exercise.type === 'time'`, missing BOTH the
      // straight_arm mechanical-type check AND the name-heuristic fallback
      // (hold/plank/hang/החזק) that isTimeBasedExercise applies — the narrowest
      // of the three reimplementations found, and the same exercise could show
      // "10 חזרות" here while showing correctly as a hold everywhere else.
      // Fallback stretches are untyped docs — a static stretch is always a 30s hold.
      reps: fromStretchFallback || isTimeBasedExercise(item.exercise) ? 30 : 10,
      isTimeBased: fromStretchFallback || isTimeBasedExercise(item.exercise),
      restSeconds: 0,
      priority: 'isolation' as const,
      score: item.score,
      reasoning: ['mandatory cooldown — muscle match'],
      exerciseRole: 'cooldown' as const,
    };

    workout.exercises.push(cooldownExercise);
  }
}

// ============================================================================
// STRETCH FALLBACK (tier 3)
// ============================================================================

const STRETCH_NAME_RE = /^מתיח/;
const LOWER_STRETCH_RE = /המסטרינג|המסתרינג|ירך|קרסול|שוק|פרפר|דוגמנית|פייק|ישבן/;

const heName = (ex: Exercise): string =>
  (typeof ex.name === 'string' ? ex.name : (ex.name as { he?: string } | undefined)?.he) ?? '';

/** 'lower' for leg / hip stretches, else 'upper'. */
function stretchArea(ex: Exercise): 'upper' | 'lower' {
  return LOWER_STRETCH_RE.test(heName(ex)) ? 'lower' : 'upper';
}

/** Upper/lower areas the session's main block trained. */
function mainAreas(workout: GeneratedWorkout): Set<'upper' | 'lower'> {
  const out = new Set<'upper' | 'lower'>();
  for (const we of workout.exercises) {
    if (we.exerciseRole === 'warmup' || we.exerciseRole === 'cooldown') continue;
    const mg = we.exercise.movementGroup as string | undefined;
    if (mg === 'squat' || mg === 'hinge' || mg === 'lunge') out.add('lower');
    else if (mg) out.add('upper');
  }
  return out;
}

/**
 * Real static stretches when the catalog has no (non-test) cooldown-role doc:
 * flexibility-tagged / movementGroup 'flexibility' first, then the untagged stretch
 * videos ("מתיחת …" with no movementGroup / role — real filmed content the catalog never
 * tagged; see scripts/audit/unreachable-warmup-stretch-videos.csv). Bodyweight only,
 * and only with a real method at this location.
 */
function stretchFallbackPool(
  allExercises: Exercise[],
  workoutIds: Set<string>,
  location: ExecutionLocation,
  filterContext: ContextualFilterContext,
): Exercise[] {
  const eligible = (ex: Exercise): boolean => {
    if (workoutIds.has(ex.id) || isTestOrPlaceholderExercise(ex)) return false;
    const method = selectMethodForContext(ex, location, filterContext.availableEquipment ?? []);
    if (!method) return false;
    const gearIds = (method.gearIds ?? (method.gearId ? [method.gearId] : [])) as (string | undefined)[];
    const equipmentIds = (method.equipmentIds ?? (method.equipmentId ? [method.equipmentId] : [])) as (string | undefined)[];
    return gearIds.filter(Boolean).length === 0 && equipmentIds.filter(Boolean).length === 0;
  };
  const tagged = allExercises.filter(ex =>
    (ex.movementGroup as string | undefined) === 'flexibility' || ((ex.tags as string[] | undefined) ?? []).includes('flexibility'),
  ).filter(eligible);
  if (tagged.length > 0) return tagged;
  // Untagged stretch videos: no movementGroup, and a role that is only the catalog
  // normaliser's default ('main') — never a warmup/recovery/reinforcement doc.
  return allExercises.filter(ex =>
    !ex.movementGroup && (!ex.exerciseRole || ex.exerciseRole === 'main') && STRETCH_NAME_RE.test(heName(ex).trim()),
  ).filter(eligible);
}
