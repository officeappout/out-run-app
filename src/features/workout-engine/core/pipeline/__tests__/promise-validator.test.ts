import { describe, it, expect } from 'vitest';
import { validatePromisesPostCut } from '../GuaranteePassRunner';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, WorkoutGenerationContext } from '../../../logic/workout-generator.types';

/**
 * Post-cut promise validator (docs/workout-engine/09-CORE-TABATA.md's
 * 05.09.2026 follow-up, David's acceptance criteria):
 *   1. Injection is always BY REPLACEMENT of the lowest-priority remaining
 *      exercise — never by addition. No candidate to replace → give up,
 *      log why. No retry ceiling (a single deterministic pass).
 *   2. Every promise logs one outcome: satisfied / injected / replaced /
 *      failed + reason.
 *   3. Core is the only ENFORCED promise this pass — horizontal/vertical
 *      foundation are logged only, never repaired.
 *   4. Core is enforced only at availableTime>=20 — below that it's
 *      optional (drops if no room), matching enforceVolumeCap's new
 *      duration-aware trim order.
 */

function makeExercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    execution_methods: [{ location: 'home', requiredGearType: 'none' }] as any,
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
    score: 10,
    reasoning: [],
    exerciseRole: 'main',
    ...overrides,
  } as any;
}

const FULL_BODY_BLUEPRINT = { strategy: 'full_body' } as any;
const SINGLE_DOMAIN_BLUEPRINT = { strategy: 'single_domain' } as any;

const CORE_CANDIDATE = makeExercise('core-cand-1', 'כפיפות בטן', {
  movementGroup: 'core',
  targetPrograms: [{ programId: 'core', level: 3 }],
} as any);

function baseContext(overrides: Partial<WorkoutGenerationContext> = {}): WorkoutGenerationContext {
  return {
    availableTime: 30,
    userLevel: 3,
    location: 'home',
    userProgramLevels: new Map([['core', 3]]),
    globalExercisePool: [CORE_CANDIDATE],
    ...overrides,
  } as any;
}

describe('validatePromisesPostCut — scope', () => {
  it('no-op for non-full-body strategy', () => {
    const exercises = [makeWorkoutExercise(makeExercise('push-1', 'push', { movementGroup: 'vertical_push' } as any))];
    const { exercises: result, results } = validatePromisesPostCut(exercises, baseContext(), SINGLE_DOMAIN_BLUEPRINT, 2 as any, []);
    expect(result).toBe(exercises);
    expect(results).toEqual([]);
  });
});

describe('validatePromisesPostCut — core outcomes', () => {
  it('satisfied: core already present, not guarantee-injected', () => {
    const core = makeWorkoutExercise(CORE_CANDIDATE);
    const exercises = [core];
    const log: string[] = [];
    const { exercises: result, results } = validatePromisesPostCut(exercises, baseContext(), FULL_BODY_BLUEPRINT, 2 as any, log);
    expect(result).toBe(exercises); // unchanged reference — nothing mutated
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('satisfied');
    expect(log.some(l => l.includes('promise_validation:core:outcome=satisfied'))).toBe(true);
  });

  it('injected: core present AND isGuaranteedCore=true (early guarantee already fixed it)', () => {
    const core = makeWorkoutExercise(CORE_CANDIDATE, { isGuaranteedCore: true } as any);
    const exercises = [core];
    const { results } = validatePromisesPostCut(exercises, baseContext(), FULL_BODY_BLUEPRINT, 2 as any, []);
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('injected');
  });

  it('failed (optional_below_20min): core missing, availableTime=15 — no repair attempted', () => {
    const nonCore = makeWorkoutExercise(makeExercise('push-1', 'push', { movementGroup: 'vertical_push' } as any));
    const exercises = [nonCore];
    const context = baseContext({ availableTime: 15 });
    const log: string[] = [];
    const { exercises: result, results } = validatePromisesPostCut(exercises, context, FULL_BODY_BLUEPRINT, 2 as any, log);
    expect(result).toBe(exercises); // unchanged — never attempted repair
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('failed');
    expect(coreResult.reason).toBe('optional_below_20min');
  });

  it('failed (unassessed): core missing, availableTime=20, user has not assessed core', () => {
    const nonCore = makeWorkoutExercise(makeExercise('push-1', 'push', { movementGroup: 'vertical_push' } as any));
    const context = baseContext({ availableTime: 20, userProgramLevels: new Map() });
    const { results } = validatePromisesPostCut([nonCore], context, FULL_BODY_BLUEPRINT, 2 as any, []);
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('failed');
    expect(coreResult.reason).toBe('unassessed');
  });

  it('failed (empty_pool): core missing, assessed, but the global pool is empty', () => {
    const nonCore = makeWorkoutExercise(makeExercise('push-1', 'push', { movementGroup: 'vertical_push' } as any));
    const context = baseContext({ availableTime: 20, globalExercisePool: [] });
    const { results } = validatePromisesPostCut([nonCore], context, FULL_BODY_BLUEPRINT, 2 as any, []);
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('failed');
    expect(coreResult.reason).toBe('empty_pool');
  });

  it('failed (no_candidate_within_band): core missing, assessed, pool non-empty but nothing is a core-domain match', () => {
    const nonCorePoolItem = makeExercise('irrelevant-1', 'unrelated push exercise', {
      movementGroup: 'vertical_push', targetPrograms: [{ programId: 'push', level: 3 }],
    } as any);
    const nonCore = makeWorkoutExercise(makeExercise('push-1', 'push', { movementGroup: 'vertical_push' } as any));
    const context = baseContext({ availableTime: 20, globalExercisePool: [nonCorePoolItem] });
    const { results } = validatePromisesPostCut([nonCore], context, FULL_BODY_BLUEPRINT, 2 as any, []);
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('failed');
    expect(coreResult.reason).toBe('no_candidate_within_band');
  });

  it('failed (no_safe_victim): candidate exists but every remaining exercise is protected (foundation / sole primary-domain)', () => {
    // A single foundation push exercise — classifyPriority reads recommendedLevel-style
    // shape; foundation classification requires a program-defined level with no
    // sub-progression markers. Simplify: sole domain member is enough to protect it
    // via PRIMARY_DOMAINS even without foundation classification.
    const solePush = makeWorkoutExercise(
      makeExercise('push-1', 'push', { movementGroup: 'vertical_push', targetPrograms: [{ programId: 'push', level: 3 }] } as any),
      { priority: 'compound' } as any,
    );
    const context = baseContext({ availableTime: 20 });
    const { exercises: result, results } = validatePromisesPostCut([solePush], context, FULL_BODY_BLUEPRINT, 2 as any, []);
    expect(result).toEqual([solePush]); // untouched
    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('failed');
    expect(coreResult.reason).toBe('no_safe_victim');
  });

  it('replaced: core missing, availableTime=20, valid candidate + a replaceable victim → injection by REPLACEMENT, not addition', () => {
    const isolation = makeWorkoutExercise(
      makeExercise('iso-1', 'isolation move', { movementGroup: 'other', targetPrograms: [{ programId: 'push', level: 3 }] } as any),
      { priority: 'isolation' } as any,
    );
    const push1 = makeWorkoutExercise(
      makeExercise('push-1', 'push a', { movementGroup: 'vertical_push', targetPrograms: [{ programId: 'push', level: 3 }] } as any),
    );
    const push2 = makeWorkoutExercise(
      makeExercise('push-2', 'push b', { movementGroup: 'horizontal_push', targetPrograms: [{ programId: 'push', level: 3 }] } as any),
    );
    const exercises = [isolation, push1, push2];
    const context = baseContext({ availableTime: 20 });
    const log: string[] = [];
    const { exercises: result, results } = validatePromisesPostCut(exercises, context, FULL_BODY_BLUEPRINT, 2 as any, log);

    // Count preserved — replacement, not addition.
    expect(result.length).toBe(exercises.length);
    // The isolation exercise (lowest priority) was replaced, not push1/push2
    // (push has 2 members so neither is individually protected, but isolation
    // still ranks first).
    expect(result.find(e => e.exercise.id === 'iso-1')).toBeUndefined();
    expect(result.some(e => e.exercise.id === CORE_CANDIDATE.id)).toBe(true);
    const injected = result.find(e => e.exercise.id === CORE_CANDIDATE.id)!;
    expect(injected.isGuaranteedCore).toBe(true);

    const coreResult = results.find(r => r.domain === 'core')!;
    expect(coreResult.outcome).toBe('replaced');
    expect(log.some(l => l.includes('promise_validation:core:outcome=replaced'))).toBe(true);
  });
});

describe('validatePromisesPostCut — horizontal/vertical are log-only', () => {
  it('logs horizontal_push/horizontal_pull and vertical foundation outcomes, never mutates exercises for them', () => {
    // Core present (so core doesn't trigger any mutation) — no horizontal/vertical
    // coverage at all, to confirm they're logged as failed WITHOUT any repair attempt.
    const core = makeWorkoutExercise(CORE_CANDIDATE);
    const exercises = [core];
    const context = baseContext({ availableTime: 45 });
    const { exercises: result, results } = validatePromisesPostCut(exercises, context, FULL_BODY_BLUEPRINT, 2 as any, []);

    expect(result.length).toBe(1); // nothing added — no enforcement for these
    const hp = results.find(r => r.domain === 'horizontal_push')!;
    const hPull = results.find(r => r.domain === 'horizontal_pull')!;
    const vPull = results.find(r => r.domain === 'vertical_pull')!;
    const vPush = results.find(r => r.domain === 'vertical_push')!;
    expect(hp.outcome).toBe('failed');
    expect(hPull.outcome).toBe('failed');
    expect(vPull.outcome).toBe('failed');
    expect(vPush.outcome).toBe('failed');
    expect([hp, hPull, vPull, vPush].every(r => r.mechanism === 'horizontal' || r.mechanism === 'vertical_foundation')).toBe(true);
  });
});
