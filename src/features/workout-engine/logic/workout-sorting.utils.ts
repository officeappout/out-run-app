/**
 * Workout Sorting Utilities
 *
 * Physiological exercise ordering, antagonist pairing, deduplication,
 * and equipment grouping. Extracted from WorkoutGenerator for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { exerciseMatchesProgram } from '../services/shadow-level.utils';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';
import type { WorkoutExercise } from './workout-generator.types';

// ============================================================================
// EQUIPMENT KEY
// ============================================================================

/**
 * Returns a canonical equipment key for antagonist pairing / sorting.
 * Normalized so that "Wide Pull-up Bar" and "Standard Pull-up Bar"
 * both return 'pullup_bar' and get grouped together.
 */
export function getEquipmentKey(ex: WorkoutExercise): string {
  const ids = [
    ...(ex.method?.gearIds ?? []),
    ...(ex.method?.equipmentIds ?? []),
  ].filter((id) => id && id !== 'bodyweight' && String(id).toLowerCase() !== 'bodyweight');
  if (ids.length === 0) return 'bodyweight';
  return normalizeGearId(ids[0]);
}

// ============================================================================
// PHYSIOLOGICAL SORT
// ============================================================================

/**
 * 5-tier physiological priority (lower = earlier in workout):
 *
 *   0 = Vertical Compounds   (vertical_pull / vertical_push)
 *   1 = Horizontal Compounds (horizontal_pull / horizontal_push)
 *   2 = Legs                 (squat / hinge / lunge — uses exerciseMatchesProgram('legs'))
 *   3 = Isolation / Accessory (priority === 'isolation' | 'accessory', not legs/core)
 *   4 = Core / Abs           (must be last to preserve stabilizer availability)
 *
 * Stable within each tier: preserves original score ordering.
 */
const VERTICAL_MOVEMENT_GROUPS = new Set(['vertical_pull', 'vertical_push']);
const HORIZONTAL_MOVEMENT_GROUPS = new Set(['horizontal_pull', 'horizontal_push']);

export function applyPhysiologicalSort(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const getDomainPriority = (ex: WorkoutExercise): number => {
    // Tier 4: Core — must come last
    if (exerciseMatchesProgram(ex.exercise, 'core')) return 4;

    // Tier 2: Legs
    if (exerciseMatchesProgram(ex.exercise, 'legs')) return 2;

    const mg = ex.exercise.movementGroup ?? '';

    // Tier 0: Vertical compounds (pull-ups, overhead press, handstand)
    if (VERTICAL_MOVEMENT_GROUPS.has(mg)) return 0;

    // Tier 1: Horizontal compounds (rows, bench-style push)
    if (HORIZONTAL_MOVEMENT_GROUPS.has(mg)) return 1;

    // Tier 3: Isolation / Accessory (arms, shoulders, single-joint)
    if (ex.priority === 'isolation' || ex.priority === 'accessory') return 3;

    // Default: treat untagged as vertical compound (placed first)
    return 0;
  };

  const indexed = exercises.map((ex, i) => ({
    ex,
    i,
    domainPri: getDomainPriority(ex),
  }));

  indexed.sort((a, b) => {
    const roleOrder: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 };
    const roleA = roleOrder[a.ex.exerciseRole ?? 'main'] ?? 1;
    const roleB = roleOrder[b.ex.exerciseRole ?? 'main'] ?? 1;
    if (roleA !== roleB) return roleA - roleB;

    if (a.domainPri !== b.domainPri) return a.domainPri - b.domainPri;

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
