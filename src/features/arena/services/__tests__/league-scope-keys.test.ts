import { describe, expect, it } from 'vitest';
import { buildScopeEntries, periodKeysFor, pickScopeNumbers } from '../league-scope-keys';

// Same dates as functions/src/__tests__/league-scope-stats.test.ts — the two
// periodKeysFor implementations must agree.
describe('periodKeysFor (client mirror)', () => {
  it.each([
    ['2026-10-16T07:00:00Z', 'W2026-10-11', 'M2026-10'],
    ['2026-10-11T09:00:00Z', 'W2026-10-11', 'M2026-10'],
    ['2026-10-17T22:30:00Z', 'W2026-10-18', 'M2026-10'],
    ['2026-10-01T09:00:00Z', 'W2026-09-27', 'M2026-10'],
    ['2027-01-01T09:00:00Z', 'W2026-12-27', 'M2027-01'],
  ])('%s', (iso, weekly, monthly) => {
    expect(periodKeysFor(new Date(iso))).toEqual({ weekly, monthly });
  });
});

describe('pickScopeNumbers', () => {
  const d = {
    scopeId: 'n1',
    totalCredit: 500,
    activeMemberCount: 10,
    byActivity: { strength: { credit: 300, members: 6 }, cardio: { credit: 200, members: 7 } },
    byGender: { female: { credit: 220, members: 4 } },
  };
  it('overall / all', () => expect(pickScopeNumbers(d, 'overall', 'all')).toEqual({ totalScore: 500, activeMemberCount: 10 }));
  it('one category', () => expect(pickScopeNumbers(d, 'strength', 'all')).toEqual({ totalScore: 300, activeMemberCount: 6 }));
  it('one gender', () => expect(pickScopeNumbers(d, 'overall', 'female')).toEqual({ totalScore: 220, activeMemberCount: 4 }));
  it('a missing bucket is zero', () => expect(pickScopeNumbers(d, 'maintenance', 'all')).toEqual({ totalScore: 0, activeMemberCount: 0 }));
  it('category AND gender → null (falls back)', () => expect(pickScopeNumbers(d, 'cardio', 'male')).toBeNull());
});

describe('buildScopeEntries', () => {
  const docs = [
    { scopeId: 'a', totalCredit: 40, activeMemberCount: 2, byActivity: { cardio: { credit: 10, members: 1 } } },
    { scopeId: 'b', totalCredit: 90, activeMemberCount: 3 },
    { scopeId: 'c', totalCredit: 0, activeMemberCount: 0 },
  ];
  const names = new Map([['a', 'שכונה א'], ['b', 'שכונה ב']]);

  it('ranks by total, drops empty scopes, names fall back to the id', () => {
    expect(buildScopeEntries(docs, names, 'overall', 'all', 10)).toEqual([
      { rank: 1, scopeId: 'b', scopeName: 'שכונה ב', totalScore: 90, activeMemberCount: 3, totalKm: 0, kmPerMember: 0 },
      { rank: 2, scopeId: 'a', scopeName: 'שכונה א', totalScore: 40, activeMemberCount: 2, totalKm: 0, kmPerMember: 0 },
    ]);
  });

  it('filters by activity and caps the list', () => {
    expect(buildScopeEntries(docs, new Map(), 'cardio', 'all', 1)).toEqual([
      { rank: 1, scopeId: 'a', scopeName: 'a', totalScore: 10, activeMemberCount: 1 },
    ]);
  });

  it('category AND gender is unanswerable → null', () => {
    expect(buildScopeEntries(docs, names, 'strength', 'female', 10)).toBeNull();
  });
});

import { buildImprovedEntries, previousPeriodKey, scopeKindOf } from '../league-scope-keys';

describe('previousPeriodKey', () => {
  it.each([
    ['weekly', 'W2026-10-11', 'W2026-10-04'],
    ['weekly', 'W2026-01-04', 'W2025-12-28'],
    ['monthly', 'M2026-10', 'M2026-09'],
    ['monthly', 'M2026-01', 'M2025-12'],
  ] as const)('%s %s → %s', (w, key, prev) => {
    expect(previousPeriodKey(w, key)).toBe(prev);
  });
});

describe('buildImprovedEntries', () => {
  const cur = [
    { scopeId: 'a', totalCredit: 100, activeMemberCount: 4 },
    { scopeId: 'b', totalCredit: 60, activeMemberCount: 2 },
    { scopeId: 'c', totalCredit: 30, activeMemberCount: 1 },
  ];
  const prev = [
    { scopeId: 'a', totalCredit: 90, activeMemberCount: 4 },
    { scopeId: 'b', totalCredit: 10, activeMemberCount: 1 },
    { scopeId: 'c', totalCredit: 50, activeMemberCount: 2 },
  ];
  it('ranks by the gain, drops anyone who went down', () => {
    const r = buildImprovedEntries(cur, prev, new Map([['b', 'ב']]), 'overall', 'all', 10)!;
    expect(r.map((e) => [e.scopeId, e.delta])).toEqual([
      ['b', 50],
      ['a', 10],
    ]);
    expect(r[0].scopeName).toBe('ב');
  });
  it('a newcomer gains its whole score', () => {
    const r = buildImprovedEntries([{ scopeId: 'n', totalCredit: 40, activeMemberCount: 1 }], [], new Map(), 'overall', 'all', 10)!;
    expect(r[0].delta).toBe(40);
  });
});

describe('scopeKindOf', () => {
  it('settlement, legacy local_council under a parent, and the rest', () => {
    expect(scopeKindOf('settlement', 'rc1')).toBe('settlement');
    expect(scopeKindOf('local_council', 'rc1')).toBe('settlement');
    expect(scopeKindOf('local_council', undefined)).toBe('local_council');
    expect(scopeKindOf('city', null)).toBe('city');
    expect(scopeKindOf('school', null)).toBe('other');
  });
});

import { buildDistanceEntries, kmOf } from '../league-scope-keys';

describe('km (distance next to the points)', () => {
  it('kmOf: meters → km, one decimal, junk → 0', () => {
    expect(kmOf(1240049)).toBe(1240);
    expect(kmOf(4150)).toBe(4.2);
    expect(kmOf(undefined)).toBe(0);
    expect(kmOf(-5)).toBe(0);
  });

  const docs = [
    { scopeId: 'a', totalCredit: 400, activeMemberCount: 4, distanceMeters: 30_000, byActivity: { cardio: { credit: 50, members: 2 } } },
    { scopeId: 'b', totalCredit: 900, activeMemberCount: 3, distanceMeters: 12_500 },
    { scopeId: 'c', totalCredit: 0, activeMemberCount: 0, distanceMeters: 800 },
    { scopeId: 'd', totalCredit: 50, activeMemberCount: 1 },
  ];

  it('board rows carry totalKm and km per active member, points untouched', () => {
    const r = buildScopeEntries(docs, new Map(), 'overall', 'all', 10)!;
    expect(r.map((e) => [e.scopeId, e.totalScore, e.totalKm, e.kmPerMember])).toEqual([
      ['b', 900, 12.5, 4.2],
      ['a', 400, 30, 7.5],
      ['d', 50, 0, 0],
    ]);
  });

  it('filtered boards leave km out (one scope-wide tally)', () => {
    const r = buildScopeEntries(docs, new Map(), 'cardio', 'all', 10)!;
    expect(r[0].totalKm).toBeUndefined();
    expect(buildImprovedEntries(docs, [], new Map(), 'overall', 'all', 10)![0].totalKm).toBe(12.5);
  });

  it('measure=distance ranks by km, keeps km-only scopes, drops scopes without km', () => {
    const r = buildDistanceEntries(docs, new Map([['a', 'א']]), 10);
    expect(r.map((e) => [e.rank, e.scopeId, e.totalKm])).toEqual([
      [1, 'a', 30],
      [2, 'b', 12.5],
      [3, 'c', 0.8],
    ]);
    expect(r[0].scopeName).toBe('א');
    expect(r[2].kmPerMember).toBe(0);
    expect(buildDistanceEntries(docs, new Map(), 1)).toHaveLength(1);
  });
});
