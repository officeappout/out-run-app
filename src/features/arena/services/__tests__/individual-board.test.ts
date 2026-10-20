import { describe, it, expect } from 'vitest';
import {
  boardScopeField,
  boardWindowStart,
  feedRows,
  groupBoardToResult,
  rankBoard,
  stepsDateRange,
  stepsRows,
} from '../individual-board';

describe('boardWindowStart (Israel time, week from Monday — the client getWindowStart)', () => {
  // Wednesday 2026-10-21 10:00 UTC = 13:00 Israel (UTC+3, before DST ends 25.10)
  const now = new Date(Date.UTC(2026, 9, 21, 10, 0, 0));
  it('daily → 00:00 Israel today', () => {
    expect(boardWindowStart('daily', now).toISOString()).toBe('2026-10-20T21:00:00.000Z');
  });
  it('weekly → Monday 00:00 Israel', () => {
    expect(boardWindowStart('weekly', now).toISOString()).toBe('2026-10-18T21:00:00.000Z');
  });
  it('monthly → the 1st 00:00 Israel', () => {
    expect(boardWindowStart('monthly', now).toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });
  it('winter time (UTC+2) and Sunday belongs to the week that started Monday before', () => {
    const sunday = new Date(Date.UTC(2026, 10, 1, 8, 0, 0)); // Sun 2026-11-01 10:00 Israel
    expect(boardWindowStart('weekly', sunday).toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
  it('just after midnight Israel is already the new day', () => {
    const t = new Date(Date.UTC(2026, 9, 20, 21, 30, 0)); // 00:30 Israel on the 21st
    expect(boardWindowStart('daily', t).toISOString()).toBe('2026-10-20T21:00:00.000Z');
  });
});

describe('stepsDateRange', () => {
  it('7 UTC days ending today, like getStepsLeaderboard', () => {
    expect(stepsDateRange(new Date(Date.UTC(2026, 9, 3, 12)))).toEqual({ from: '2026-09-27', to: '2026-10-03' });
  });
});

describe('boardScopeField', () => {
  it('maps like scopeToField', () => {
    expect(boardScopeField('city')).toBe('authorityId');
    expect(boardScopeField('reserve')).toBe('reserveScope');
    expect(boardScopeField('global')).toBeNull();
    expect(boardScopeField('league')).toBeNull();
  });
});

describe('feedRows', () => {
  const posts = [
    { authorUid: 'a', authorName: 'A', activityCredit: 30, distanceKm: 5.04 },
    { authorUid: 'a', authorName: 'A', activityCredit: 10, distanceKm: 0 },
    { authorUid: 'b', activityCredit: 50, distanceKm: 2.33 },
    { activityCredit: 99 },
  ];
  it('credit sums per author', () => {
    expect(feedRows(posts, 'credit')).toEqual([
      { uid: 'a', name: 'A', total: 40, count: 2 },
      { uid: 'b', name: '???', total: 50, count: 1 },
    ]);
  });
  it('distance skips posts without distance, rounds to 0.1', () => {
    expect(feedRows(posts, 'distance')).toEqual([
      { uid: 'a', name: 'A', total: 5, count: 1 },
      { uid: 'b', name: '???', total: 2.3, count: 1 },
    ]);
  });
  it('a combined workout post counts only its own part on a category board', () => {
    const hybrid = [{ authorUid: 'h', authorName: 'H', activityCredit: 52, activityCategory: 'cardio',
      hybridParts: { runKm: 2, walkKm: 1, runMinutes: 12, walkMinutes: 10, strengthMinutes: 15, strengthSets: 9 } }];
    expect(feedRows(hybrid, 'credit')[0].total).toBe(52);
    expect(feedRows(hybrid, 'credit', 'overall')[0].total).toBe(52);
    expect(feedRows(hybrid, 'credit', 'cardio')[0].total).toBe(22);
  });
});

describe('stepsRows', () => {
  it('7-day average (total ÷ 7), zero days ignored', () => {
    const rows = stepsRows([
      { uid: 'a', displayName: 'A', steps: 7000 },
      { uid: 'a', displayName: 'A', steps: 7000 },
      { uid: 'b', steps: 0 },
    ]);
    expect(rows).toEqual([{ uid: 'a', name: 'A', total: 2000, count: 2000 }]);
  });
});

describe('rankBoard', () => {
  const rows = [
    { uid: 'a', name: 'A', total: 10, count: 1 },
    { uid: 'b', name: 'B', total: 30, count: 1 },
    { uid: 'c', name: 'C', total: 20, count: 1 },
  ];
  it('ranks highest first, top N, me inside', () => {
    const r = rankBoard(rows, 'c', undefined, 2);
    expect(r.entries.map((e) => [e.rank, e.uid])).toEqual([[1, 'b'], [2, 'c']]);
    expect(r.myEntry).toMatchObject({ rank: 2, uid: 'c', isCurrentUser: true });
    expect(r.totalParticipants).toBe(3);
  });
  it('me outside the top N keeps my real rank', () => {
    expect(rankBoard(rows, 'a', undefined, 2).myEntry).toMatchObject({ rank: 3, totalCredit: 10 });
  });
  it('me with no row → participants + 1 with 0, named', () => {
    expect(rankBoard(rows, 'z', 'דנה', 2).myEntry).toMatchObject({ rank: 4, name: 'דנה', totalCredit: 0 });
  });
});

describe('groupBoardToResult', () => {
  const board = {
    totals: { points: 0, stepsPoints: 0, km: 0, activeMembers: 0 },
    members: [
      { uid: 'a', name: 'A', points: 40, stepsPoints: 9, km: 3.1, isMe: false },
      { uid: 'b', name: 'B', points: 25, stepsPoints: 24, km: 12, isMe: true },
      { uid: 'c', name: 'C', points: 0, stepsPoints: 0, km: 1, isMe: false },
    ],
  };
  it('general → points; zero rows dropped', () => {
    expect(groupBoardToResult(board, 'points', 'b', undefined, 50).entries.map((e) => e.uid)).toEqual(['a', 'b']);
  });
  it('steps → steps points; distance → km', () => {
    expect(groupBoardToResult(board, 'stepsPoints', 'b', undefined, 50).entries.map((e) => e.uid)).toEqual(['b', 'a']);
    expect(groupBoardToResult(board, 'km', 'b', undefined, 50).entries.map((e) => [e.uid, e.totalCredit])).toEqual([['b', 12], ['a', 3.1], ['c', 1]]);
  });
});
