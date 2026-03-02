/**
 * Workout Sorting Utilities
 *
 * Physiological exercise ordering, antagonist pairing, deduplication,
 * and equipment grouping. Extracted from WorkoutGenerator for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { exerciseMatchesProgram } from '../services/shadow-level.utils';
import type { WorkoutExercise } from './workout-generator.types';

// ============================================================================
// EQUIPMENT KEY
// ============================================================================

export function getEquipmentKey(ex: WorkoutExercise): string {
  const ids = [
    ...(ex.method?.gearIds ?? []),
    ...(ex.method?.equipmentIds ?? []),
    ...(ex.exercise.equipment ?? []),
  ].filter((id) => id && id !== 'bodyweight' && String(id).toLowerCase() !== 'bodyweight');
  return ids[0] ?? 'bodyweight';
}

// ============================================================================
// PHYSIOLOGICAL SORT
// ============================================================================

/**
 * CNS Priority Map for movement groups within the upper-body block.
 * Vertical patterns recruit more CNS resources (lats, overhead stabilizers)
 * and must precede horizontal patterns to avoid pre-fatigue.
 *
 *   0 = vertical (pull-ups, overhead press, handstand work)
 *   1 = everything else / untagged
 *   2 = horizontal (rows, bench-style push)
 */
const MOVEMENT_GROUP_CNS_PRIORITY: Record<string, number> = {
  vertical_pull: 0,
  vertical_push: 0,
  horizontal_pull: 2,
  horizontal_push: 2,
};

/**
 * Sort exercises: [Upper Body (Push/Pull)] -> [Legs] -> [Core].
 *
 * Priority map (lower = earlier):
 *   0 = push / pull / skill / unmatched (upper body block)
 *   1 = legs
 *   2 = core (must be last to avoid stabilizer fatigue during compounds)
 *
 * Within Priority 0, a CNS sub-sort applies:
 *   vertical_pull / vertical_push  ->  untagged  ->  horizontal_pull / horizontal_push
 *
 * Stable within each sub-tier: preserves original score ordering.
 */
export function applyPhysiologicalSort(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const getDomainPriority = (ex: WorkoutExercise): number => {
    if (exerciseMatchesProgram(ex.exercise, 'core')) return 2;
    if (exerciseMatchesProgram(ex.exercise, 'legs')) return 1;
    return 0;
  };

  const getCnsPriority = (ex: WorkoutExercise): number => {
    const mg = ex.exercise.movementGroup;
    if (!mg) return 1;
    return MOVEMENT_GROUP_CNS_PRIORITY[mg] ?? 1;
  };

  const indexed = exercises.map((ex, i) => ({
    ex,
    i,
    domainPri: getDomainPriority(ex),
    cnsPri: getCnsPriority(ex),
  }));

  indexed.sort((a, b) => {
    const roleOrder: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 };
    const roleA = roleOrder[a.ex.exerciseRole ?? 'main'] ?? 1;
    const roleB = roleOrder[b.ex.exerciseRole ?? 'main'] ?? 1;
    if (roleA !== roleB) return roleA - roleB;

    if (a.domainPri !== b.domainPri) return a.domainPri - b.domainPri;

    if (a.domainPri === 0 && a.cnsPri !== b.cnsPri) return a.cnsPri - b.cnsPri;

    return a.i - b.i;
  });

  return indexed.map((item) => item.ex);
}

// ============================================================================
// ANTAGONIST PAIRING
// ============================================================================

export function applyAntagonistPairing(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const legs: WorkoutExercise[] = [];
  const pull: WorkoutExercise[] = [];
  const push: WorkoutExercise[] = [];
  const other: WorkoutExercise[] = [];

  for (const ex of exercises) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') {
      other.push(ex);
      continue;
    }
    if (exerciseMatchesProgram(ex.exercise, 'push')) push.push(ex);
    else if (exerciseMatchesProgram(ex.exercise, 'pull')) pull.push(ex);
    else if (exerciseMatchesProgram(ex.exercise, 'legs')) legs.push(ex);
    else other.push(ex);
  }

  const legsQuad: WorkoutExercise[] = [];
  const legsHamstring: WorkoutExercise[] = [];
  for (const ex of legs) {
    const muscle = ex.exercise.primaryMuscle;
    if (muscle === 'hamstrings' || muscle === 'glutes') legsHamstring.push(ex);
    else legsQuad.push(ex);
  }
  legsQuad.sort((a, b) => getEquipmentKey(a).localeCompare(getEquipmentKey(b)));
  legsHamstring.sort((a, b) => getEquipmentKey(a).localeCompare(getEquipmentKey(b)));
  const legPairs: WorkoutExercise[] = [];
  const legPairCount = Math.min(legsQuad.length, legsHamstring.length);
  for (let i = 0; i < legPairCount; i++) {
    legPairs.push(
      { ...legsQuad[i], pairedWith: legsHamstring[i].exercise.id },
      { ...legsHamstring[i], pairedWith: legsQuad[i].exercise.id },
    );
  }
  for (let i = legPairCount; i < legsQuad.length; i++) legPairs.push(legsQuad[i]);
  for (let i = legPairCount; i < legsHamstring.length; i++) legPairs.push(legsHamstring[i]);

  const pushPullPairs: WorkoutExercise[] = [];
  const pullUsed = new Set<number>();
  const pushUsed = new Set<number>();
  const pairCount = Math.min(pull.length, push.length);

  for (let round = 0; round < pairCount; round++) {
    let bestPullIdx = -1;
    let bestPushIdx = -1;
    let bestScore = -1;

    for (let pi = 0; pi < pull.length; pi++) {
      if (pullUsed.has(pi)) continue;
      for (let pj = 0; pj < push.length; pj++) {
        if (pushUsed.has(pj)) continue;
        const score = getEquipmentKey(pull[pi]) === getEquipmentKey(push[pj]) ? 1 : 0;
        if (score > bestScore) {
          bestScore = score;
          bestPullIdx = pi;
          bestPushIdx = pj;
        }
      }
    }

    if (bestPullIdx >= 0 && bestPushIdx >= 0) {
      pullUsed.add(bestPullIdx);
      pushUsed.add(bestPushIdx);
      pushPullPairs.push(
        { ...pull[bestPullIdx], pairedWith: push[bestPushIdx].exercise.id },
        { ...push[bestPushIdx], pairedWith: pull[bestPullIdx].exercise.id },
      );
    }
  }
  for (let i = 0; i < pull.length; i++) if (!pullUsed.has(i)) pushPullPairs.push(pull[i]);
  for (let i = 0; i < push.length; i++) if (!pushUsed.has(i)) pushPullPairs.push(push[i]);

  const result = [...legPairs, ...pushPullPairs, ...other];
  if (pairCount > 0 || legPairCount > 0) {
    console.log(`[WorkoutGenerator] Antagonist pairing: ${pairCount} push+pull, ${legPairCount} quad+hamstring`);
  }
  return result;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

export function deduplicateExercises(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const seen = new Set<string>();
  return exercises.filter((ex) => {
    const id = ex.exercise.id;
    if (seen.has(id)) {
      console.warn(`[WorkoutGenerator] Duplicate exercise removed: ${id}`);
      return false;
    }
    seen.add(id);
    return true;
  });
}
