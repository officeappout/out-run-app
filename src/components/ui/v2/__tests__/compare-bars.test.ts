import { describe, expect, it } from 'vitest';
import { pairedWidths, splitWidths } from '../compare-bars';

describe('splitWidths', () => {
  it('shares sum to exactly 100 and drop empty parts', () => {
    const s = splitWidths([{ key: 'a', value: 96 }, { key: 'b', value: 78 }, { key: 'c', value: 40 }, { key: 'd', value: 0 }]);
    expect(s.map((p) => p.key)).toEqual(['a', 'b', 'c']);
    expect(s.reduce((t, p) => t + p.pct, 0)).toBeCloseTo(100, 6);
    expect(s[0].pct).toBeCloseTo(44.9, 1);
  });
  it('thirds still add up to 100', () => {
    const s = splitWidths([{ key: 'a', value: 1 }, { key: 'b', value: 1 }, { key: 'c', value: 1 }]);
    expect(s.reduce((t, p) => t + p.pct, 0)).toBeCloseTo(100, 6);
  });
  it('nothing → empty', () => {
    expect(splitWidths([{ key: 'a', value: 0 }, { key: 'b', value: Number.NaN }])).toEqual([]);
  });
});

describe('pairedWidths', () => {
  it('the larger value fills the track', () => {
    expect(pairedWidths(96, 70)).toEqual({ current: 100, previous: 73 });
    expect(pairedWidths(11, 12)).toEqual({ current: 92, previous: 100 });
  });
  it('zeros and junk', () => {
    expect(pairedWidths(0, 0)).toEqual({ current: 0, previous: 0 });
    expect(pairedWidths(5, -3)).toEqual({ current: 100, previous: 0 });
  });
});
