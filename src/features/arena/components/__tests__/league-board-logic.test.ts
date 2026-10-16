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
