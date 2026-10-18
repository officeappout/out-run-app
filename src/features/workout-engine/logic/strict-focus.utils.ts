/**
 * strict-focus.utils.ts — the last word on a STRICT body-area request (builder
 * body-area chips → requiredDomains + strictDomains; the AI chat's domains).
 *
 * Why (05-BENCHMARK §6.4 #3, H2 = 52-71% pass): #434 closed the domain-blind fill in
 * selectExercisesWithDomainQuotas, but a strict request still leaks through every pass
 * that adds or swaps a MAIN exercise after selection — the core guarantee, flow
 * regression / intense David-rule injection, MG-diversity backfill, vertical-foundation
 * injection, the naked backfill, the tabata finisher — and through exercises whose
 * program TAG matches but whose movement does not (e.g. a calf raise, movementGroup
 * 'isolation', tagged legs; an untagged doc with no movementGroup at all).
 *
 * Rule: under a strict request every MAIN exercise's movementGroup must resolve
 * (MG_TO_DOMAIN, skills folded to their parent) to a requested domain. Unmapped
 * movement groups (isolation / flexibility / none) never satisfy a strict request.
 * Off-focus exercises are removed and the reserve is filtered by the same rule, so
 * enforceVolumeCap's variety add-back refills on-focus only. A shorter on-focus
 * session is the honest result (same stance as #434).
 */
import type { GeneratedWorkout, WorkoutExercise } from './workout-generator.types';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import { DOMAIN_RESOLUTION_SKILL_PARENT_MAP } from './workout-selection.utils';
import { clearOrphanedPairings } from './workout-sorting.utils';

/** push / pull / legs / core (+ skill slug), or null for an unmapped movement group. */
export function strictDomainsOfExercise(ex: WorkoutExercise['exercise']): string[] {
  const mg = ex?.movementGroup as string | undefined;
  const d = mg ? MG_TO_DOMAIN[mg] : undefined;
  if (!d) return [];
  const parent = DOMAIN_RESOLUTION_SKILL_PARENT_MAP[d];
  return parent ? [d, parent] : [d];
}

export function isOnStrictFocus(ex: WorkoutExercise['exercise'], requiredDomains: readonly string[]): boolean {
  return strictDomainsOfExercise(ex).some(d => requiredDomains.includes(d));
}

const isMainRole = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

/**
 * Removes off-focus MAIN exercises (and off-focus reserve candidates) from a strict
 * request's workout. Strict requests never get a tabata finisher (home-workout.service
 * zeroes tabataProbability); a core tabata block is dropped whole when off focus.
 * Returns the removed exercise names (for the log). No-op when not strict.
 */
export function enforceStrictFocus(
  workout: GeneratedWorkout,
  requiredDomains: readonly string[] | undefined,
  strict: boolean | undefined,
): string[] {
  if (!strict || !requiredDomains?.length) return [];
  const removed: string[] = [];
  // A tabata block (core block form B / finisher) goes as a whole: only when NONE of
  // its members is on focus — a partly on-focus block keeps its shape.
  const blockMembers = workout.exercises.filter(e => isMainRole(e) && e.protocolBlock);
  const dropBlock = blockMembers.length > 0 && !blockMembers.some(e => isOnStrictFocus(e.exercise, requiredDomains));
  if (dropBlock) workout.tabataBlock = undefined;
  workout.exercises = workout.exercises.filter(e => {
    if (!isMainRole(e)) return true;
    if (e.protocolBlock && !dropBlock) return true;
    if (isOnStrictFocus(e.exercise, requiredDomains)) return true;
    removed.push(((e.exercise.name as { he?: string } | undefined)?.he) ?? e.exercise.id);
    return false;
  });
  if (workout.reserveExercises?.length) {
    workout.reserveExercises = workout.reserveExercises.filter(e => isOnStrictFocus(e.exercise, requiredDomains));
  }
  if (removed.length) workout.exercises = clearOrphanedPairings(workout.exercises);
  return removed;
}
