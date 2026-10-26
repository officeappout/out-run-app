import { describe, expect, it } from 'vitest';
import {
  activityFromType,
  prefillWhen,
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
  const base = { userId: 'u1', displayName: 'Dana', photoURL: null, startTime: at(18, 0), visibility: 'everyone' as const };
  it('a park writes parkId + parkName (no route fields) — what the park list reads', () => {
    const place: TrainingHerePlace = { kind: 'park', id: 'p1', name: 'Yarkon', lat: 32.1, lng: 34.8 };
    const input = buildArrivalInput({ ...base, place, activity: 'workout' });
    expect(input).toEqual({
      userId: 'u1', displayName: 'Dana', photoURL: null, parkId: 'p1', parkName: 'Yarkon',
      lat: 32.1, lng: 34.8, activityType: 'workout', startTime: at(18, 0), privacyMode: 'verified_global', audience: 'public',
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
    const input = buildArrivalInput({ ...base, place, activity: 'running', visibility: 'partners' });
    expect(input.routeId).toBe('r1');
    expect(input.routeName).toBe('Loop');
    expect(input.parkId).toBeUndefined();
    expect(input.activityType).toBe('running');
    // שותפי אימון = mutual follows: feed audience 'partners', privacyMode 'ghost' (no client listener reads it), no groupId.
    expect(input.privacyMode).toBe('ghost');
    expect(input.audience).toBe('partners');
    expect('groupId' in input).toBe(false);
  });
});

describe('prefillWhen (joining a partner\'s share)', () => {
  const now = at(16, 20);
  it('now when it starts within 10 minutes (or already started)', () => {
    expect(prefillWhen(at(16, 25), now).when).toBe('now');
    expect(prefillWhen(at(15, 0), now).when).toBe('now');
  });
  it('the matching hour chip, else אחר with HH:MM', () => {
    expect(prefillWhen(at(18, 0), now)).toEqual({ when: 'later', chipKey: '1', otherTime: '18:00' });
    expect(prefillWhen(at(18, 30), now)).toEqual({ when: 'later', chipKey: 'other', otherTime: '18:30' });
  });
});

describe('activityFromType', () => {
  it('maps planned_sessions types onto the sheet', () => {
    expect(activityFromType('running')).toBe('running');
    expect(activityFromType('walking')).toBe('walking');
    expect(activityFromType('workout')).toBe('workout');
    expect(activityFromType(undefined)).toBe('workout');
  });
});
