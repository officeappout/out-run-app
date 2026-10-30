import { describe, expect, it } from 'vitest';
import { computeTabataStep } from '../tabata.step';

/**
 * AG10 (phone test 30.10.2026): a machine tabata interval (a reps-type member with no reps / hold
 * target) used to be logged as 0, so the summary read "0 sets" after a done round. The step now
 * carries the work seconds as the fallback the log uses when the set has no target.
 */
const base = {
  isUnilateral: false,
  currentSide: null,
  pendingRightElapsed: null,
  config: { workSec: 30, restSec: 30, rounds: 2 },
  memberCosts: [1, 1],
  exerciseIndex: 0,
  setIdx: 0,
};

describe('computeTabataStep log fallback', () => {
  it('a non-time member carries the work seconds as its fallback', () => {
    const step = computeTabataStep({ ...base, reps: undefined, exerciseType: 'reps' });
    expect(step.kind).toBe('logAndContinue');
    if (step.kind !== 'logAndContinue') return;
    expect(step.log.targetReps).toBeUndefined();
    expect(step.log.timedFallbackSec).toBe(30);
  });
  it('a time member logs its real elapsed, no fallback', () => {
    const step = computeTabataStep({ ...base, reps: 28, exerciseType: 'time' });
    if (step.kind !== 'logAndContinue') throw new Error('expected a log');
    expect(step.log.targetReps).toBe(28);
    expect(step.log.timedFallbackSec).toBeUndefined();
  });
  it('no work seconds → no fallback', () => {
    const step = computeTabataStep({ ...base, config: { workSec: 0, restSec: 0, rounds: 1 }, reps: undefined, exerciseType: 'reps' });
    if (step.kind !== 'logAndContinue') throw new Error('expected a log');
    expect(step.log.timedFallbackSec).toBeUndefined();
  });
});
