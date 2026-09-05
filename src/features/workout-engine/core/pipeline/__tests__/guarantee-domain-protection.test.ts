import { describe, it, expect } from 'vitest';
import { runHorizontalGuarantee, runVerticalFoundationGuarantee } from '../GuaranteePassRunner';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, WorkoutGenerationContext } from '../../../logic/workout-generator.types';

/**
 * Shared victim-protection rule (David, 05.09.2026 — found via a live trace
 * where a full-body workout came out push+pull ONLY: HorizontalGuarantee's
 * "domain has rich budget -> ADD an extra horizontal by replacing the
 * lowest-scored OTHER-domain exercise" sacrificed the session's only legs
 * exercise to add a redundant second push exercise. Confirmed firing in
 * 22.2% of a live sample — never a "core bug", core was the symptom; any
 * primary domain could be (and was) the victim.
 *
 * The rule: a guarantee pass must NEVER remove the sole remaining
 * representative of a PRIMARY_DOMAINS domain (push/pull/legs/core).
 * runFullBodyDomainGuarantee already had this; runHorizontalGuarantee and
 * runVerticalFoundationGuarantee did not — both fixed here onto the same
 * shared predicate (computeDomainCounts/isSafeDomainVictim/
 * pickVictimProtectingDomains) instead of two separate patches.
 */

function makeExercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    execution_methods: [{ location: 'home', requiredGearType: 'none' }] as any,
    targetPrograms: [],
    ...overrides,
  } as any;
}

function makeWorkoutExercise(ex: Exercise, overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    exercise: ex,
    method: (ex as any).execution_methods[0],
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 60,
    priority: 'compound',
    score: 50,
    reasoning: [],
    exerciseRole: 'main',
    ...overrides,
  } as any;
}

const FULL_BODY_BLUEPRINT = { strategy: 'full_body' } as any;

function baseContext(overrides: Partial<WorkoutGenerationContext> = {}): WorkoutGenerationContext {
  return {
    availableTime: 45,
    userLevel: 5,
    location: 'home',
    userProgramLevels: new Map([['push', 5], ['pull', 5], ['legs', 5]]),
    globalExercisePool: [
      makeExercise('pool-hpush-1', 'push aop', { movementGroup: 'horizontal_push', targetPrograms: [{ programId: 'push', level: 5 }] } as any),
    ],
    requiredDomains: undefined,
    strictDomains: false,
    ...overrides,
  } as any;
}

describe('runHorizontalGuarantee — never sacrifices the sole representative of another domain', () => {
  it('rich-budget ADD path: refuses to replace the ONLY legs exercise, logs why, leaves legs intact', () => {
    // push domain: vertical_push + a 2nd push exercise -> domainSets > 3 (rich budget).
    // pull domain: has vertical_pull (so horizontal_pull guarantee has a "hasVertical" target too,
    // but we only care about horizontal_push's rich-budget path here).
    // legs: exactly ONE exercise — must survive.
    const verticalPush = makeWorkoutExercise(
      makeExercise('vpush-1', 'vertical push', { movementGroup: 'vertical_push' } as any),
      { sets: 4, score: 80 },
    );
    const extraPush = makeWorkoutExercise(
      makeExercise('push-2', 'extra push', { movementGroup: 'vertical_push' } as any),
      { sets: 4, score: 70 },
    );
    const soleLegs = makeWorkoutExercise(
      makeExercise('legs-1', 'the only legs exercise', { movementGroup: 'squat' } as any),
      { priority: 'accessory', score: 10 }, // lowest score — would be picked first if unprotected
    );
    const verticalPull = makeWorkoutExercise(
      makeExercise('vpull-1', 'vertical pull', { movementGroup: 'vertical_pull' } as any),
      { score: 60 },
    );

    const exercises = [verticalPush, extraPush, soleLegs, verticalPull];
    const log: string[] = [];
    const result = runHorizontalGuarantee(exercises, baseContext(), FULL_BODY_BLUEPRINT, 2 as any, log);

    // Legs must still be present — never sacrificed to add a redundant push.
    expect(result.some(e => e.exercise.id === 'legs-1')).toBe(true);
    // The skip must be logged with a reason.
    expect(log.some(l => l.includes('SKIPPED add-path') && l.includes('would empty another primary domain'))).toBe(true);
  });

  it('standard path fallback: refuses to replace the sole representative of another domain', () => {
    // No vertical counterpart present for pull, and the ONLY other candidate
    // in the workout is the sole legs exercise — must not be sacrificed.
    const soleLegs = makeWorkoutExercise(
      makeExercise('legs-1', 'the only legs exercise', { movementGroup: 'squat' } as any),
      { score: 5 },
    );
    const context = baseContext({
      globalExercisePool: [
        makeExercise('pool-hpull-1', 'pull aop', { movementGroup: 'horizontal_pull', targetPrograms: [{ programId: 'pull', level: 5 }] } as any),
      ],
    });
    const log: string[] = [];
    const result = runHorizontalGuarantee([soleLegs], context, FULL_BODY_BLUEPRINT, 2 as any, log);

    expect(result.some(e => e.exercise.id === 'legs-1')).toBe(true);
    expect(log.some(l => l.includes('no safe victim to replace') && l.includes('horizontal_pull'))).toBe(true);
  });
});

describe('runVerticalFoundationGuarantee — never sacrifices the sole representative of another domain', () => {
  it('refuses to replace the ONLY legs exercise to inject a vertical_pull foundation', () => {
    const soleLegs = makeWorkoutExercise(
      makeExercise('legs-1', 'the only legs exercise', { movementGroup: 'squat' } as any),
      { score: 5 },
    );
    const context = baseContext({
      globalExercisePool: [
        makeExercise('pool-vpull-found', 'foundation pull', {
          movementGroup: 'vertical_pull',
          targetPrograms: [{ programId: 'pull', level: 5 }],
          recommendedLevel: 5,
          tags: ['foundation'],
        } as any),
      ],
    });
    const log: string[] = [];
    const result = runVerticalFoundationGuarantee([soleLegs], context, FULL_BODY_BLUEPRINT, 2 as any, log);

    expect(result.some(e => e.exercise.id === 'legs-1')).toBe(true);
    expect(log.some(l => l.includes('no safe victim to replace'))).toBe(true);
  });
});
