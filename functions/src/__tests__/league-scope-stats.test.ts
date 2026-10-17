import { describe, expect, it } from 'vitest';
import {
  activityOf,
  creditOf,
  minutesOf,
  periodKeysFor,
  scopeTargetsFor,
  statsDocId,
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
