import { describe, expect, it } from 'vitest';
import { summaryActivity, summaryWorkout } from '../unsaved-aerobic-summary';

describe('AK5: a discarded (unsaved) aerobic workout', () => {
  it('a free walk with no snapshot reads as a walk, not "ריצה"', () => {
    expect(summaryActivity(undefined, 'walking')).toBe('walking');
    expect(summaryActivity(null, 'walking')).toBe('walking');
  });
  it('a saved snapshot wins; an unknown kind stays a run (as before)', () => {
    expect(summaryActivity('running', 'walking')).toBe('running');
    expect(summaryActivity('walking', 'running')).toBe('walking');
    expect(summaryActivity('cycling', 'walking')).toBe('running');
    expect(summaryActivity(undefined, 'cycling')).toBe('running');
  });
  it('no snapshot → the live totals (time / distance / path), not an empty workout', () => {
    const w = summaryWorkout(null, { activity: 'walking', durationSec: 37, distanceKm: 0.004, routeCoords: [[34.7, 32.1]] });
    expect(w.activityType).toBe('walking');
    expect(w.duration).toBe(37);
    expect(w.distance).toBe(0.004);
    expect(w.routePath).toEqual([[34.7, 32.1]]);
    expect(w.date).toBeInstanceOf(Date);
  });
  it('a snapshot passes through unchanged', () => {
    const snap = { activityType: 'running', duration: 600, distance: 2 } as never;
    expect(summaryWorkout(snap, { activity: 'walking', durationSec: 1, distanceKm: 0, routeCoords: [] }).duration).toBe(600);
  });
});
