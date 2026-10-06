import { describe, it, expect } from 'vitest';
import {
  isSmallSample,
  sortCommandRows,
  pickMostFit,
  pickBiggestGap,
  pickMostNearThreshold,
  computeInternalGap,
  singleComponentBreakdown,
  type CommandRankableRow,
} from '../readiness-command.util';

function row(overrides: Partial<CommandRankableRow>): CommandRankableRow {
  return {
    id: 'a', hasData: true, totalCount: 100, testedCount: 50, passPercent: 50,
    nearThresholdCount: 0, appActiveCount: 0, gap: null,
    ...overrides,
  };
}

describe('isSmallSample', () => {
  it('flags below the floor', () => {
    expect(isSmallSample(9, 10)).toBe(true);
    expect(isSmallSample(10, 10)).toBe(false);
    expect(isSmallSample(33, 10)).toBe(false);
  });
});

describe('sortCommandRows', () => {
  it('pushes no-data rows to the end regardless of sort key/direction', () => {
    const rows = [row({ id: 'empty', hasData: false, totalCount: 0, testedCount: 0, passPercent: null }), row({ id: 'big', totalCount: 400 }), row({ id: 'small', totalCount: 3 })];
    const sorted = sortCommandRows(rows, 'size', 'desc');
    expect(sorted.map((r) => r.id)).toEqual(['big', 'small', 'empty']);
  });

  it('sorts by size descending by default semantics', () => {
    const rows = [row({ id: 'small', totalCount: 3 }), row({ id: 'big', totalCount: 400 })];
    expect(sortCommandRows(rows, 'size', 'desc').map((r) => r.id)).toEqual(['big', 'small']);
    expect(sortCommandRows(rows, 'size', 'asc').map((r) => r.id)).toEqual(['small', 'big']);
  });

  it('a 3-soldier 100% brigade does not outrank a 400-soldier 78% brigade when sorting by size', () => {
    const rows = [row({ id: 'tiny-perfect', totalCount: 3, testedCount: 3, passPercent: 100 }), row({ id: 'huge-good', totalCount: 400, testedCount: 400, passPercent: 78 })];
    expect(sortCommandRows(rows, 'size', 'desc').map((r) => r.id)).toEqual(['huge-good', 'tiny-perfect']);
  });

  it('sorts rows with a null metric (e.g. gap) after rows with a real value, within the hasData group', () => {
    const rows = [row({ id: 'no-gap', gap: null }), row({ id: 'has-gap', gap: 15 })];
    expect(sortCommandRows(rows, 'gap', 'desc').map((r) => r.id)).toEqual(['has-gap', 'no-gap']);
  });

  it('"who is failing most" is passPercent ascending, not a separate sort option', () => {
    const rows = [row({ id: 'high', passPercent: 90 }), row({ id: 'low', passPercent: 20 })];
    expect(sortCommandRows(rows, 'passPercent', 'asc').map((r) => r.id)).toEqual(['low', 'high']);
  });
});

describe('pickMostFit', () => {
  it('excludes small-sample rows from the crown even with a perfect percent', () => {
    const rows = [row({ id: 'tiny-perfect', testedCount: 3, passPercent: 100 }), row({ id: 'real', testedCount: 50, passPercent: 90 })];
    expect(pickMostFit(rows, 10)?.row.id).toBe('real');
  });

  it('returns null when nothing qualifies (all small-sample)', () => {
    const rows = [row({ id: 'a', testedCount: 2, passPercent: 100 }), row({ id: 'b', testedCount: 1, passPercent: 50 })];
    expect(pickMostFit(rows, 10)).toBeNull();
  });

  it('ignores rows with no data at all', () => {
    const rows = [row({ id: 'empty', hasData: false, testedCount: 0, passPercent: null }), row({ id: 'real', testedCount: 20, passPercent: 70 })];
    expect(pickMostFit(rows, 10)?.row.id).toBe('real');
  });

  it('a real 0% among qualifying rows is still a valid (if unflattering) pick', () => {
    const rows = [row({ id: 'zero', testedCount: 20, passPercent: 0 })];
    expect(pickMostFit(rows, 10)?.value).toBe(0);
  });
});

describe('pickBiggestGap', () => {
  it('picks the row with the largest precomputed gap', () => {
    const rows = [row({ id: 'small-gap', gap: 5 }), row({ id: 'big-gap', gap: 40 })];
    expect(pickBiggestGap(rows)?.row.id).toBe('big-gap');
  });

  it('returns null when no row has a computable gap', () => {
    expect(pickBiggestGap([row({ id: 'a', gap: null })])).toBeNull();
  });
});

describe('pickMostNearThreshold', () => {
  it('picks the highest nearThresholdCount among qualifying rows', () => {
    const rows = [row({ id: 'low', testedCount: 20, nearThresholdCount: 1 }), row({ id: 'high', testedCount: 20, nearThresholdCount: 5 })];
    expect(pickMostNearThreshold(rows, 10)?.row.id).toBe('high');
  });

  it('excludes small-sample rows even with a high count', () => {
    const rows = [row({ id: 'tiny', testedCount: 2, nearThresholdCount: 2 }), row({ id: 'real', testedCount: 20, nearThresholdCount: 1 })];
    expect(pickMostNearThreshold(rows, 10)?.row.id).toBe('real');
  });

  it('a real 0 across the board is still returned, not treated as "nothing to show"', () => {
    const rows = [row({ id: 'a', testedCount: 20, nearThresholdCount: 0 })];
    expect(pickMostNearThreshold(rows, 10)?.value).toBe(0);
  });
});

describe('computeInternalGap', () => {
  it('returns null with fewer than 2 qualifying children', () => {
    expect(computeInternalGap([{ testedCount: 20, passPercent: 50 }], 10)).toBeNull();
    expect(computeInternalGap([], 10)).toBeNull();
  });

  it('excludes small-sample children from the spread calculation', () => {
    const children = [
      { testedCount: 2, passPercent: 100 }, // small-sample, excluded
      { testedCount: 20, passPercent: 80 },
      { testedCount: 20, passPercent: 60 },
    ];
    expect(computeInternalGap(children, 10)).toBe(20);
  });

  it('a child with no determinable passPercent is excluded', () => {
    const children = [{ testedCount: 20, passPercent: null }, { testedCount: 20, passPercent: 70 }];
    expect(computeInternalGap(children, 10)).toBeNull();
  });
});

describe('singleComponentBreakdown', () => {
  it('derives notYetTestedCount from totalCount minus the component testedCount, reports notPerformedCount as 0', () => {
    const result = singleComponentBreakdown(50, { passCount: 10, failCount: 10, testedCount: 20, passPercent: 50 });
    expect(result).toEqual({ passCount: 10, failCount: 10, notPerformedCount: 0, notYetTestedCount: 30, testedCount: 20, passPercent: 50 });
  });

  it('floors notYetTestedCount at 0 rather than going negative', () => {
    const result = singleComponentBreakdown(5, { passCount: 3, failCount: 3, testedCount: 6, passPercent: 50 });
    expect(result.notYetTestedCount).toBe(0);
  });
});
