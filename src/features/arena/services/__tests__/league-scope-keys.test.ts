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
      { rank: 1, scopeId: 'b', scopeName: 'שכונה ב', totalScore: 90, activeMemberCount: 3 },
      { rank: 2, scopeId: 'a', scopeName: 'שכונה א', totalScore: 40, activeMemberCount: 2 },
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
