import { describe, expect, it } from 'vitest';
import {
  stepsDayNeedsApply,
  activityOf,
  creditOf,
  distanceMetersOfDay,
  isCountedMember,
  minutesOf,
  periodKeysFor,
  scopeTargetsFor,
  statsDocId,
  stepsDayDelta,
  STEPS_PER_KM_ESTIMATE,
} from '../lib/league-scope-stats';

describe('activityOf', () => {
  it('maps workout categories to league buckets', () => {
    expect(activityOf('strength')).toBe('strength');
    expect(activityOf('hybrid')).toBe('strength');
    expect(activityOf(undefined, 'workout')).toBe('strength');
    expect(activityOf('cardio')).toBe('cardio');
    expect(activityOf(undefined, 'running')).toBe('cardio');
    expect(activityOf('recovery')).toBe('maintenance');
  });
});

describe('minutes and credit', () => {
  it('workouts.duration is seconds', () => {
    expect(minutesOf(35 * 60)).toBe(35);
    expect(minutesOf(89)).toBe(1);
    expect(minutesOf(undefined)).toBe(0);
    expect(minutesOf(-5)).toBe(0);
  });
  it('strength counts double (same as activityCredit)', () => {
    expect(creditOf(35, 'strength')).toBe(70);
    expect(creditOf(20, 'cardio')).toBe(20);
    expect(creditOf(10, 'maintenance')).toBe(10);
  });
});

describe('periodKeysFor (Asia/Jerusalem, week starts Sunday)', () => {
  it('a Friday → that week’s Sunday', () => {
    // Fri 16 Oct 2026, 10:00 Israel (07:00 UTC)
    expect(periodKeysFor(new Date('2026-10-16T07:00:00Z'))).toEqual({ weekly: 'W2026-10-11', monthly: 'M2026-10' });
  });
  it('Sunday is its own week start', () => {
    expect(periodKeysFor(new Date('2026-10-11T09:00:00Z')).weekly).toBe('W2026-10-11');
  });
  it('late Saturday night UTC is already Sunday in Israel', () => {
    // Sat 17 Oct 2026 22:30 UTC = Sun 18 Oct 01:30 Israel
    expect(periodKeysFor(new Date('2026-10-17T22:30:00Z')).weekly).toBe('W2026-10-18');
  });
  it('a week that starts in the previous month', () => {
    // Thu 1 Oct 2026 → Sunday 27 Sep
    expect(periodKeysFor(new Date('2026-10-01T09:00:00Z'))).toEqual({ weekly: 'W2026-09-27', monthly: 'M2026-10' });
  });
  it('across a year boundary', () => {
    // Fri 1 Jan 2027 → Sunday 27 Dec 2026
    expect(periodKeysFor(new Date('2027-01-01T09:00:00Z'))).toEqual({ weekly: 'W2026-12-27', monthly: 'M2027-01' });
  });
});

describe('scopeTargetsFor', () => {
  it('city, neighborhood (with its city) and each group once', () => {
    expect(scopeTargetsFor({ authorityId: 'tlv', neighborhoodId: 'n1' }, ['g1', 'g2', 'g1', '', 7])).toEqual([
      { granularity: 'city', scopeId: 'tlv', parentId: null },
      { granularity: 'neighborhood', scopeId: 'n1', parentId: 'tlv' },
      { granularity: 'group', scopeId: 'g1', parentId: null },
      { granularity: 'group', scopeId: 'g2', parentId: null },
    ]);
  });
  it('nothing bound → nothing counted', () => {
    expect(scopeTargetsFor(undefined, undefined)).toEqual([]);
  });
});

it('statsDocId', () => {
  expect(statsDocId('weekly', 'W2026-10-11', { granularity: 'neighborhood', scopeId: 'n1' })).toBe('weekly_W2026-10-11_neighborhood_n1');
});

describe('distanceMetersOfDay', () => {
  it('prefers the synced distance', () => {
    expect(distanceMetersOfDay(5000, 4210.6)).toBe(4211);
  });
  it('falls back to the steps estimate (same 1,300 steps/km as the steps screen)', () => {
    expect(STEPS_PER_KM_ESTIMATE).toBe(1300);
    expect(distanceMetersOfDay(1300, undefined)).toBe(1000);
    expect(distanceMetersOfDay(6500, 0)).toBe(5000);
    expect(distanceMetersOfDay(650, null)).toBe(500);
  });
  it('nothing → 0', () => {
    expect(distanceMetersOfDay(undefined, undefined)).toBe(0);
    expect(distanceMetersOfDay('x', -3)).toBe(0);
    expect(distanceMetersOfDay(NaN, NaN)).toBe(0);
  });
});

describe('stepsDayDelta', () => {
  it('first run adds everything', () => {
    expect(stepsDayDelta(undefined, 15, 4000)).toEqual({ credit: 15, distanceMeters: 4000 });
  });
  it('old markers without distance add the whole day once', () => {
    expect(stepsDayDelta({ credit: 15 }, 15, 4000)).toEqual({ credit: 0, distanceMeters: 4000 });
  });
  it('adds only what grew, never subtracts, each independently', () => {
    expect(stepsDayDelta({ credit: 15, distanceMeters: 4000 }, 21, 3500)).toEqual({ credit: 6, distanceMeters: 0 });
    expect(stepsDayDelta({ credit: 15, distanceMeters: 4000 }, 12, 4600)).toEqual({ credit: 0, distanceMeters: 600 });
  });
});

describe('stepsDayNeedsApply (the rollup pre-check)', () => {
  it('a day never applied needs it when it has points or km', () => {
    expect(stepsDayNeedsApply(undefined, 4200, 3000)).toBe(true);
    expect(stepsDayNeedsApply(undefined, 500, undefined)).toBe(true); // km estimate only
    expect(stepsDayNeedsApply(undefined, 0, 0)).toBe(false);
  });
  it('unchanged since the last run → skip', () => {
    expect(stepsDayNeedsApply({ credit: 12, distanceMeters: 3000 }, 4200, 3000)).toBe(false);
  });
  it('more steps (a new full 1,000) or more km → apply', () => {
    expect(stepsDayNeedsApply({ credit: 12, distanceMeters: 3000 }, 5100, 3000)).toBe(true);
    expect(stepsDayNeedsApply({ credit: 12, distanceMeters: 3000 }, 4200, 3400)).toBe(true);
  });
  it('steps within the same 1,000 and the same km → skip (nothing to add)', () => {
    expect(stepsDayNeedsApply({ credit: 12, distanceMeters: 3000 }, 4900, 3000)).toBe(false);
  });
  it('fewer steps than applied never re-applies (deltas never go negative)', () => {
    expect(stepsDayNeedsApply({ credit: 15, distanceMeters: 4000 }, 4200, 3000)).toBe(false);
  });
});

describe('isCountedMember', () => {
  it('only members with points are active', () => {
    expect(isCountedMember(undefined)).toBe(false);
    expect(isCountedMember({})).toBe(false);
    expect(isCountedMember({ credit: 0 })).toBe(false);
    expect(isCountedMember({ credit: 3 })).toBe(true);
  });
});
