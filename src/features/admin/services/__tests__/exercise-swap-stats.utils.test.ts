import { describe, it, expect } from 'vitest';
import {
  autoLabels,
  buildSwapStatsTables,
  toSwapStatsRow,
  wilsonLowerBound,
  MIN_SAMPLE,
} from '../exercise-swap-stats.utils';

describe('wilsonLowerBound', () => {
  it('is 0 with no data and below the raw rate otherwise', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(2, 2)).toBeLessThan(0.5);
    expect(wilsonLowerBound(50, 100)).toBeGreaterThan(0.39);
    expect(wilsonLowerBound(50, 100)).toBeLessThan(0.5);
  });
});

describe('buildSwapStatsTables', () => {
  it('ranks n ≥ MIN_SAMPLE by Wilson bound and keeps small samples apart', () => {
    const { ranked, lowData } = buildSwapStatsTables([
      { id: 'big_low', swappedAway: 10, prescribedCompleted: 90 }, // 10%
      { id: 'big_high', swappedAway: 30, prescribedCompleted: 30 }, // 50%
      { id: 'tiny', swappedAway: 3, prescribedCompleted: 0 }, // 100% of 3
      { id: 'never', swappedAway: 0, prescribedCompleted: 500 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['big_high', 'big_low']);
    expect(lowData.map((r) => r.id)).toEqual(['tiny']);
    expect(ranked.every((r) => r.n >= MIN_SAMPLE)).toBe(true);
  });

  it('row shape: top-3 replacements with names, reasons with labels', () => {
    const r = toSwapStatsRow({
      id: 'pu',
      name: 'PU',
      lastLevel: 5,
      swappedAway: 6,
      prescribedCompleted: 14,
      byDirection: { lower: 4, same: 2 },
      topReplacements: { a: 1, b: 3, c: 2, d: 1 },
      replacementNames: { b: 'B' },
      byReason: { too_hard: 3, pain: 1 },
    });
    expect(r.swapRate).toBeCloseTo(0.3);
    expect(r.direction).toEqual({ lower: 4, same: 2, higher: 0 });
    expect(r.topReplacements.map((t) => t.name)).toEqual(['B', 'c', 'a']);
    expect(r.topReasons[0]).toEqual({ reason: 'too_hard', label: 'קשה מדי', count: 3 });
  });
});

describe('autoLabels', () => {
  it('mostly ↓ + coach-hint → level labelled too low', () => {
    expect(
      autoLabels({ id: 'x', swappedAway: 10, byDirection: { lower: 8, same: 2 }, bySource: { in_workout_coach_hint: 4 } }),
    ).toContain('level_too_low');
  });

  it('mostly = + alternative tab (or dislike) → disliked', () => {
    expect(
      autoLabels({ id: 'x', swappedAway: 10, byDirection: { same: 9, lower: 1 }, byTab: { alternative: 7, adaptation: 3 } }),
    ).toContain('disliked');
    expect(
      autoLabels({ id: 'x', swappedAway: 10, byDirection: { same: 9 }, byTab: { adaptation: 9 }, byReason: { dislike: 4 } }),
    ).toContain('disliked');
  });

  it('no_equipment reason or one-location concentration → equipment', () => {
    expect(autoLabels({ id: 'x', swappedAway: 3, byReason: { no_equipment: 2, too_hard: 1 } })).toContain('equipment');
    expect(autoLabels({ id: 'x', swappedAway: 10, byLocation: { home: 9, park: 1 } })).toContain('equipment');
    expect(autoLabels({ id: 'x', swappedAway: 3, byLocation: { home: 3 } })).not.toContain('equipment');
  });

  it('nothing for an exercise nobody swapped', () => {
    expect(autoLabels({ id: 'x', prescribedCompleted: 40 })).toEqual([]);
  });
});
