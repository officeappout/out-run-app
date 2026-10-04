import { describe, it, expect } from 'vitest';
import { resolveOutcomeType } from '../pushOutcomeSweeper';

/**
 * Proves the outcome-checker dispatch (parametrized 04.10.2026, previously
 * a single hardcoded Daily_Goal/walking branch with every other category
 * silently marked "unresolvable"). Pure function, no Firestore I/O.
 */
describe('resolveOutcomeType', () => {
  it('routes Daily_Goal + walking to the specific step-goal checker', () => {
    expect(resolveOutcomeType('Daily_Goal', 'walking')).toBe('daily_step_goal');
  });

  it('routes every other category to the generic workout-started checker', () => {
    expect(resolveOutcomeType('Future_Partner_Plan', undefined)).toBe('workout_started');
    expect(resolveOutcomeType('Inactivity', undefined)).toBe('workout_started');
    expect(resolveOutcomeType('ScheduledWorkout', undefined)).toBe('workout_started');
    expect(resolveOutcomeType(undefined, undefined)).toBe('workout_started');
  });

  it('routes Daily_Goal with a non-walking activityType to the generic checker, not the step-goal one', () => {
    // Daily_Goal alone isn't sufficient — the specific checker only fires
    // for the exact combination it knows how to verify.
    expect(resolveOutcomeType('Daily_Goal', 'running')).toBe('workout_started');
  });
});
