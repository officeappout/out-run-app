import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PyramidProcessor, MIN_PYRAMID_STEP_REPS, MIN_PYRAMID_STEP_HOLD_SECONDS } from '../pyramid.processor';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, WorkoutGenerationContext } from '../../workout-generator.types';

/**
 * Generator audit P0 #4 (2026-10-17): the D3 peak slot was authored as 1 rep →
 * "8/3/1" pyramids, and on time-based steps a 3-second hold (1 × 2.5 s TUT).
 * Every step is now floored at 3 reps / 8 seconds; variant choice is unchanged.
 */

const variant = (id: string, level: number, type: 'reps' | 'time' = 'reps'): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup: 'vertical_pull',
    type,
    targetPrograms: [{ programId: 'pull', level }],
    execution_methods: [{ location: 'park', gearIds: [] }],
    tags: [],
  } as unknown as Exercise);

const slotFor = (exercise: Exercise, isTimeBased = false): WorkoutExercise =>
  ({
    exercise, method: {}, mechanicalType: 'bent_arm', sets: 3, reps: 5, restSeconds: 120,
    isTimeBased, exerciseRole: 'main', priority: 'compound', score: 50, reasoning: [],
  } as unknown as WorkoutExercise);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ctx = (pool: Exercise[], difficulty: 1 | 2 | 3) =>
  ({ difficulty, globalExercisePool: pool, userProgramLevels: new Map([['pull', 8]]) } as unknown as WorkoutGenerationContext);

describe('PyramidProcessor — per-step floors', () => {
  it('D3 rep pyramid: no step below 3 reps, repsSequence matches the steps', () => {
    const pool = [4, 5, 6, 7, 8, 9, 10].map(l => variant(`v${l}`, l));
    const we = slotFor(pool[4]);
    PyramidProcessor.process([we], ctx(pool, 3));
    expect(we.pyramidSequence?.length).toBe(3);
    for (const s of we.pyramidSequence!) expect(s.targetReps!).toBeGreaterThanOrEqual(MIN_PYRAMID_STEP_REPS);
    expect(Math.min(...we.repsSequence!)).toBeGreaterThanOrEqual(MIN_PYRAMID_STEP_REPS);
    expect(we.pyramidSequence!.map(s => s.targetReps)).toEqual(we.repsSequence);
  });

  it('D3 hold pyramid: no step below 8 seconds', () => {
    const pool = [4, 5, 6, 7, 8, 9, 10].map(l => variant(`h${l}`, l, 'time'));
    const we = slotFor(pool[4], true);
    PyramidProcessor.process([we], ctx(pool, 3));
    expect(we.pyramidSequence?.length).toBe(3);
    for (const s of we.pyramidSequence!) expect(s.targetHold!).toBeGreaterThanOrEqual(MIN_PYRAMID_STEP_HOLD_SECONDS);
  });

  it('D2 wave shape is unchanged (its smallest step is already 3)', () => {
    const pool = [3, 4, 5, 6, 7, 8, 9, 10].map(l => variant(`w${l}`, l));
    const we = slotFor(pool[5]);
    PyramidProcessor.process([we], ctx(pool, 2));
    expect(we.repsSequence).toEqual([8, 5, 3, 5, 8]);
  });
});
