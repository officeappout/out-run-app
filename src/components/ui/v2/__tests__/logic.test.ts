import { describe, it, expect } from 'vitest';
import {
  computeDelta,
  countUpValue,
  easeOutV2,
  formatStat,
  chartCeiling,
  layoutBars,
  resolveSnap,
  rubberBand,
} from '../logic';

describe('computeDelta', () => {
  it('reports up/down with a rounded absolute percent', () => {
    expect(computeDelta(1200, 1000)).toEqual({ direction: 'up', pct: 20 });
    expect(computeDelta(750, 1000)).toEqual({ direction: 'down', pct: 25 });
  });
  it('is flat when the rounded change is 0', () => {
    expect(computeDelta(1001, 1000)).toEqual({ direction: 'flat', pct: 0 });
  });
  it('hides (null) without a real baseline', () => {
    expect(computeDelta(500, 0)).toBeNull();
    expect(computeDelta(500, null)).toBeNull();
    expect(computeDelta(500, undefined)).toBeNull();
    expect(computeDelta(500, NaN)).toBeNull();
  });
});

describe('count-up', () => {
  it('eases from 0 to 1 monotonically', () => {
    expect(easeOutV2(0)).toBe(0);
    expect(easeOutV2(1)).toBe(1);
    expect(easeOutV2(0.5)).toBeGreaterThan(0.5); // ease-out: front-loaded
  });
  it('lands exactly on the target at/after the duration', () => {
    expect(countUpValue(0, 8432, 900, 900)).toBe(8432);
    expect(countUpValue(0, 8432, 5000, 900)).toBe(8432);
    expect(countUpValue(100, 200, 0, 900)).toBe(100);
  });
  it('formats with he-IL grouping and fixed decimals', () => {
    expect(formatStat(8432)).toBe('8,432');
    expect(formatStat(5.237, 2)).toBe('5.24');
    expect(formatStat(NaN)).toBe('—');
  });
});

describe('bar layout', () => {
  it('pads the ceiling 10% above the larger of max and goal', () => {
    expect(chartCeiling([100, 200], 1000)).toBeCloseTo(1100);
    expect(chartCeiling([100, 2000], 1000)).toBeCloseTo(2200);
    expect(chartCeiling([], null)).toBe(1);
  });
  it('marks bars that reached the goal and staggers delays', () => {
    const { bars, goalRatio } = layoutBars(
      [
        { key: 'a', label: 'א', value: 10000 },
        { key: 'b', label: 'ב', value: 4000 },
      ],
      8000,
      0.05,
    );
    expect(bars[0].reachedGoal).toBe(true);
    expect(bars[1].reachedGoal).toBe(false);
    expect(bars[1].delay).toBeCloseTo(0.05);
    expect(goalRatio).toBeCloseTo(8000 / 11000);
  });
  it('treats negative/NaN values as 0 and has no goal line without a goal', () => {
    const { bars, goalRatio } = layoutBars([{ key: 'x', label: 'x', value: NaN }], null);
    expect(bars[0].ratio).toBe(0);
    expect(goalRatio).toBeNull();
  });
});

describe('sheet snapping', () => {
  const snaps = [140, 420, 760];
  it('settles on the nearest snap for a slow release', () => {
    expect(resolveSnap(snaps, 500, 0)).toBe(420);
    expect(resolveSnap(snaps, 700, 100)).toBe(760);
  });
  it('a downward flick moves to the next smaller snap', () => {
    expect(resolveSnap(snaps, 740, 900)).toBe(420);
    expect(resolveSnap(snaps, 130, 900)).toBe(140);
  });
  it('an upward flick moves to the next larger snap', () => {
    expect(resolveSnap(snaps, 160, -900)).toBe(420);
  });
  it('rubber-bands past the edges with diminishing travel', () => {
    expect(rubberBand(0, 800)).toBe(0);
    const a = rubberBand(100, 800);
    const b = rubberBand(200, 800);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(100);
    expect(b - a).toBeLessThan(a);
    expect(rubberBand(-100, 800)).toBeCloseTo(-a);
  });
});
