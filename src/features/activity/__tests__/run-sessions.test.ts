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
  it('a real hybrid doc (activityType "hybrid") counts by its legs', () => {
    const station = { kind: 'strength', actual: { durationSec: 300, sets: 6 } };
    const runLeg = { kind: 'aerobic', aerobicType: 'running', actual: { durationSec: 600, distanceKm: 2 } };
    const walkLeg = { kind: 'aerobic', aerobicType: 'walking', actual: { durationSec: 600, distanceKm: 1 } };
    expect(isRunSession({ workoutType: 'hybrid', activityType: 'hybrid', segments: [walkLeg, station, runLeg] })).toBe(true);
    expect(isRunSession({ workoutType: 'hybrid', activityType: 'hybrid', segments: [walkLeg, station, walkLeg] })).toBe(false);
  });
  it('counts a week of mixed docs', () => {
    expect(countRunSessions([
      { workoutType: 'running' }, { workoutType: 'walking' }, { workoutType: 'walking' },
      { workoutType: 'strength' }, { workoutType: 'hybrid', activityType: 'running' },
    ])).toBe(2);
    expect(countRunSessions(undefined)).toBe(0);
  });
});

describe('run-done minimum (enable_home_v2 only, applyMinimum)', () => {
  const tap = { workoutType: 'running', activityType: 'running', duration: 60, distance: 0.1 };
  const real = { workoutType: 'running', activityType: 'running', duration: 1800, distance: 4 };
  it('default: every saved run counts (flag-off parity)', () => {
    expect(countRunSessions([tap, real])).toBe(2);
  });
  it('applyMinimum: a 1 min / 0.1 km run does not count toward the week, a real run does', () => {
    expect(countRunSessions([tap, real], { applyMinimum: true })).toBe(1);
  });
  it('applyMinimum leaves combined workouts and walks alone', () => {
    const hybrid = { workoutType: 'hybrid', activityType: 'running', duration: 30 };
    expect(countRunSessions([hybrid, { workoutType: 'walking', duration: 10 }], { applyMinimum: true })).toBe(1);
  });
});
