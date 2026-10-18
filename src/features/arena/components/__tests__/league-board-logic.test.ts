import { describe, it, expect } from 'vitest';
import {
  splitScore,
  getVisibleRows,
  shouldPinMyRow,
  isSparseBoard,
  computeNextRankTarget,
  formatNextRankLine,
  hasPeriodEnd,
  getPeriodEnd,
  formatTimeLeft,
  battleSplit,
  BOARD_VISIBLE_ROWS,
  perMember,
  rankByMeasure,
  challengeProgress,
} from '../league-board-logic';

function row(rank: number, totalCredit: number, isCurrentUser = false, name = `p${rank}`) {
  return { rank, uid: isCurrentUser ? 'me' : `u${rank}`, name, totalCredit, isCurrentUser };
}

describe('splitScore', () => {
  it('splits number and unit', () => {
    expect(splitScore(6, 'general')).toEqual({ value: '6', unit: 'ימים' });
    expect(splitScore(12.5, 'distance')).toEqual({ value: '12.5', unit: 'ק"מ' });
    expect(splitScore(40, 'strength')).toEqual({ value: '40', unit: "נק' כוח" });
  });
});

describe('visible range + pinned row', () => {
  const entries = Array.from({ length: 24 }, (_, i) => row(i + 1, 100 - i, i + 1 === 14));
  const me = entries[13];

  it('collapses to the visible limit unless expanded', () => {
    expect(getVisibleRows(entries, false)).toHaveLength(BOARD_VISIBLE_ROWS);
    expect(getVisibleRows(entries, true)).toHaveLength(24);
  });

  it('pins you when you are below the visible cut', () => {
    expect(shouldPinMyRow(getVisibleRows(entries, false), me)).toBe(true);
    expect(shouldPinMyRow(getVisibleRows(entries, true), me)).toBe(false);
  });

  it('pins you when you are outside the fetched top-N entirely', () => {
    const outside = row(73, 2, true);
    expect(shouldPinMyRow(entries.slice(0, 10).map((e) => ({ ...e, isCurrentUser: false })), outside)).toBe(true);
  });

  it('does not pin without an entry', () => {
    expect(shouldPinMyRow(entries, null)).toBe(false);
  });
});

describe('isSparseBoard', () => {
  it('is sparse between 1 and 4 participants', () => {
    expect(isSparseBoard(0)).toBe(false);
    expect(isSparseBoard(1)).toBe(true);
    expect(isSparseBoard(4)).toBe(true);
    expect(isSparseBoard(5)).toBe(false);
  });
});

describe('computeNextRankTarget', () => {
  const entries = [row(1, 20, false, 'נועה'), row(2, 17, false, 'איתי'), row(3, 15, true, 'דוד')];

  it('targets the row directly above you, gap + one step', () => {
    const t = computeNextRankTarget(entries, entries[2], 'general');
    expect(t).toEqual({ targetName: 'איתי', targetRank: 2, needed: 3, progress: 15 / 17 });
    expect(formatNextRankLine(t!, 'general')).toBe('עוד 3 ימים כדי לעקוף את איתי');
  });

  it('uses a 0.1 step for distance', () => {
    const d = [row(1, 12.4), row(2, 10.0, true)];
    expect(computeNextRankTarget(d, d[1], 'distance')?.needed).toBe(2.5);
  });

  it('handles a tie (needs one step)', () => {
    const tie = [row(1, 10, false, 'נועה'), row(2, 10, true)];
    const t = computeNextRankTarget(tie, tie[1], 'general')!;
    expect(t.needed).toBe(1);
    expect(formatNextRankLine(t, 'general')).toBe('עוד יום אחד כדי לעקוף את נועה');
  });

  it('returns null at #1, without an entry, in pace mode, or when the row above was not fetched', () => {
    expect(computeNextRankTarget(entries, row(1, 20, true), 'general')).toBeNull();
    expect(computeNextRankTarget(entries, null, 'general')).toBeNull();
    expect(computeNextRankTarget(entries, entries[2], 'running', true)).toBeNull();
    expect(computeNextRankTarget(entries, row(60, 1, true), 'general')).toBeNull();
  });
});

describe('period end + countdown', () => {
  it('only windowed metrics have a period end', () => {
    expect(hasPeriodEnd('distance')).toBe(true);
    expect(hasPeriodEnd('general')).toBe(false);
    expect(hasPeriodEnd('steps')).toBe(false);
  });

  it('weekly ends on the next Monday 00:00 (getWindowStart weeks start Monday)', () => {
    // Thu 15 Oct 2026, 14:00 local
    const now = new Date(2026, 9, 15, 14, 0);
    expect(getPeriodEnd('weekly', now)).toEqual(new Date(2026, 9, 19, 0, 0));
    // Sunday belongs to the week that started the previous Monday
    expect(getPeriodEnd('weekly', new Date(2026, 9, 18, 10, 0))).toEqual(new Date(2026, 9, 19, 0, 0));
    // Monday morning → a full week ahead
    expect(getPeriodEnd('weekly', new Date(2026, 9, 19, 1, 0))).toEqual(new Date(2026, 9, 26, 0, 0));
  });

  it('daily ends at midnight, monthly on the 1st of next month', () => {
    const now = new Date(2026, 11, 31, 9, 0);
    expect(getPeriodEnd('daily', now)).toEqual(new Date(2027, 0, 1, 0, 0));
    expect(getPeriodEnd('monthly', now)).toEqual(new Date(2027, 0, 1, 0, 0));
  });

  it('formats the time left in Hebrew', () => {
    const now = new Date(2026, 9, 15, 14, 0);
    expect(formatTimeLeft(new Date(2026, 9, 19, 0, 0), now)).toBe('נשארו 3 ימים');
    expect(formatTimeLeft(new Date(2026, 9, 16, 15, 0), now)).toBe('נשאר יום אחד');
    expect(formatTimeLeft(new Date(2026, 9, 15, 19, 30), now)).toBe('נשארו 5 שעות');
    expect(formatTimeLeft(new Date(2026, 9, 15, 15, 10), now)).toBe('נשארה שעה אחת');
    expect(formatTimeLeft(new Date(2026, 9, 15, 14, 20), now)).toBe('נשארה פחות משעה');
    expect(formatTimeLeft(now, now)).toBe('התקופה הסתיימה');
  });
});

describe('battleSplit', () => {
  it('splits proportionally', () => {
    expect(battleSplit(15870, 16210)).toEqual({ minePct: 49, theirsPct: 51 });
  });
  it('floors each side at 4%', () => {
    expect(battleSplit(0, 100)).toEqual({ minePct: 4, theirsPct: 96 });
    expect(battleSplit(100, 0)).toEqual({ minePct: 96, theirsPct: 4 });
  });
  it('is even when both are zero', () => {
    expect(battleSplit(0, 0)).toEqual({ minePct: 50, theirsPct: 50 });
  });
});

describe('rankByMeasure (average vs total)', () => {
  const scopes = [
    { name: 'גדולה', totalScore: 1000, activeMemberCount: 20 }, // 50 per member
    { name: 'קטנה', totalScore: 300, activeMemberCount: 4 }, // 75 per member
    { name: 'בינונית', totalScore: 600, activeMemberCount: 10 }, // 60 per member
  ];
  it('average: a small active neighborhood wins', () => {
    expect(rankByMeasure(scopes, 'avg').map((s) => [s.name, s.rank])).toEqual([
      ['קטנה', 1],
      ['בינונית', 2],
      ['גדולה', 3],
    ]);
  });
  it('total: the sum wins', () => {
    expect(rankByMeasure(scopes, 'total').map((s) => s.name)).toEqual(['גדולה', 'בינונית', 'קטנה']);
  });
  it('perMember is 0 with no active members', () => {
    expect(perMember({ totalScore: 50, activeMemberCount: 0 })).toBe(0);
    expect(perMember({ totalScore: 100, activeMemberCount: 3 })).toBe(33);
  });
});

describe('challengeProgress', () => {
  it('rounds the percent to one decimal and reports what is left', () => {
    expect(challengeProgress(123_456, 1_000_000)).toEqual({ pct: 12.3, left: 876_544, done: false });
  });
  it('clamps at 100% once the goal is reached', () => {
    expect(challengeProgress(1_200_000, 1_000_000)).toEqual({ pct: 100, left: 0, done: true });
  });
  it('treats bad totals and goals as zero progress', () => {
    expect(challengeProgress(Number.NaN, 1000)).toEqual({ pct: 0, left: 1000, done: false });
    expect(challengeProgress(-5, 1000)).toEqual({ pct: 0, left: 1000, done: false });
    expect(challengeProgress(10, 0)).toEqual({ pct: 0, left: 0, done: false });
  });
});

import { formatKm, rankByKm } from '../league-board-logic';

describe('km next to the points', () => {
  it('formatKm', () => {
    expect(formatKm(1240.4)).toBe((1240).toLocaleString('he-IL'));
    expect(formatKm(4.25)).toBe((4.3).toLocaleString('he-IL'));
    expect(formatKm(12)).toBe('12');
    expect(formatKm(undefined)).toBe('0');
    expect(formatKm(-3)).toBe('0');
  });
  it('rankByKm — per member or total, ties keep order', () => {
    const e = [
      { id: 'a', totalKm: 30, kmPerMember: 7.5 },
      { id: 'b', totalKm: 12.5, kmPerMember: 12.5 },
      { id: 'c' },
      { id: 'd', totalKm: 30, kmPerMember: 1 },
    ];
    expect(rankByKm(e, 'total').map((x) => [x.id, x.rank])).toEqual([['a', 1], ['d', 2], ['b', 3], ['c', 4]]);
    expect(rankByKm(e, 'avg').map((x) => x.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});
