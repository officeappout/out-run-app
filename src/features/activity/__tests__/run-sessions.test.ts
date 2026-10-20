import { describe, expect, it } from 'vitest';
import { countRunSessions, isRunSession } from '../utils/run-sessions';

describe('weekly runs count only runs (owner 20.10.2026)', () => {
  it('a run counts, a walk / strength / cycling does not', () => {
    expect(isRunSession({ workoutType: 'running', activityType: 'running' })).toBe(true);
    expect(isRunSession({ activityType: 'running' })).toBe(true);
    expect(isRunSession({ workoutType: 'walking', activityType: 'walking' })).toBe(false);
    expect(isRunSession({ workoutType: 'strength' })).toBe(false);
    expect(isRunSession({ activityType: 'cycling' })).toBe(false);
    expect(isRunSession(null)).toBe(false);
  });
  it('a run + strength hybrid counts; a walk + strength hybrid does not', () => {
    expect(isRunSession({ workoutType: 'hybrid', activityType: 'running' })).toBe(true);
    expect(isRunSession({ workoutType: 'hybrid', activityType: 'walking' })).toBe(false);
  });
  it('counts a week of mixed docs', () => {
    expect(countRunSessions([
      { workoutType: 'running' }, { workoutType: 'walking' }, { workoutType: 'walking' },
      { workoutType: 'strength' }, { workoutType: 'hybrid', activityType: 'running' },
    ])).toBe(2);
    expect(countRunSessions(undefined)).toBe(0);
  });
});
