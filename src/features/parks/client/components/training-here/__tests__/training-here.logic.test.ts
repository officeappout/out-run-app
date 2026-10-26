import { describe, expect, it } from 'vitest';
import {
  buildArrivalInput,
  laterTimeOptions,
  nextOccurrence,
  reminderTimeFor,
  resolveStartTime,
  type TrainingHerePlace,
} from '../training-here.logic';

const at = (h: number, m: number, day = 26) => new Date(2026, 9, day, h, m, 0, 0);

describe('laterTimeOptions', () => {
  it('offers the next three full hours', () => {
    expect(laterTimeOptions(at(16, 20)).map((d) => d.getHours())).toEqual([17, 18, 19]);
  });
  it('a full hour itself is not offered (strictly after now)', () => {
    expect(laterTimeOptions(at(17, 0))[0].getHours()).toBe(18);
  });
  it('crosses midnight into tomorrow', () => {
    const [a, b] = laterTimeOptions(at(22, 40), 2);
    expect([a.getHours(), a.getDate()]).toEqual([23, 26]);
    expect([b.getHours(), b.getDate()]).toEqual([0, 27]);
  });
});

describe('nextOccurrence', () => {
  it('today when still ahead, tomorrow when already past', () => {
    expect(nextOccurrence('18:30', at(16, 0))?.getTime()).toBe(at(18, 30).getTime());
    expect(nextOccurrence('07:00', at(16, 0))?.getTime()).toBe(at(7, 0, 27).getTime());
  });
  it('null for malformed input', () => {
    expect(nextOccurrence('25:00', at(16, 0))).toBeNull();
    expect(nextOccurrence('abc', at(16, 0))).toBeNull();
  });
});

describe('resolveStartTime / reminderTimeFor', () => {
  const now = at(16, 20);
  it('now ignores the picked time; later without a pick falls back to now', () => {
    expect(resolveStartTime('now', at(18, 0), now)).toBe(now);
    expect(resolveStartTime('later', null, now)).toBe(now);
    expect(resolveStartTime('later', at(18, 0), now).getHours()).toBe(18);
  });
  it('15 minutes before, never in the past', () => {
    expect(reminderTimeFor(at(18, 0), now).getTime()).toBe(at(17, 45).getTime());
    expect(reminderTimeFor(at(16, 25), now).getTime()).toBe(now.getTime());
  });
});

describe('buildArrivalInput', () => {
  const base = { userId: 'u1', displayName: 'Dana', photoURL: null, startTime: at(18, 0), visibility: 'verified_global' as const };
  it('a park writes parkId + parkName (no route fields) — what the park list reads', () => {
    const place: TrainingHerePlace = { kind: 'park', id: 'p1', name: 'Yarkon', lat: 32.1, lng: 34.8 };
    const input = buildArrivalInput({ ...base, place, activity: 'workout' });
    expect(input).toEqual({
      userId: 'u1', displayName: 'Dana', photoURL: null, parkId: 'p1', parkName: 'Yarkon',
      lat: 32.1, lng: 34.8, activityType: 'workout', startTime: at(18, 0), privacyMode: 'verified_global',
    });
    expect('routeId' in input).toBe(false);
    expect('workoutTitle' in input).toBe(false);
  });
  it('stores the workout title when given (trimmed), never an empty one', () => {
    const place: TrainingHerePlace = { kind: 'park', id: 'p1', name: 'Yarkon', lat: 1, lng: 2 };
    expect(buildArrivalInput({ ...base, place, activity: 'workout', workoutTitle: ' Upper body ' }).workoutTitle).toBe('Upper body');
    expect('workoutTitle' in buildArrivalInput({ ...base, place, activity: 'workout', workoutTitle: '  ' })).toBe(false);
  });
  it('a route writes routeId + routeName with the activity type', () => {
    const place: TrainingHerePlace = { kind: 'route', id: 'r1', name: 'Loop', lat: null, lng: null };
    const input = buildArrivalInput({ ...base, place, activity: 'running', visibility: 'squad' });
    expect(input.routeId).toBe('r1');
    expect(input.routeName).toBe('Loop');
    expect(input.parkId).toBeUndefined();
    expect(input.activityType).toBe('running');
    expect(input.privacyMode).toBe('squad');
  });
});
