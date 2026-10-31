import { describe, expect, it } from 'vitest';
import { buildHybridWorkoutEntry, savedLaps } from '../hybrid-save.service';
import type { HybridFinalizeResult } from '../hybrid-orchestrator';

const lap = (n: number, over: Record<string, unknown> = {}) =>
  ({ id: `l${n}`, lapNumber: n, distanceMeters: 1000.4, durationSeconds: 348.6, splitPace: 5.8, isActive: false, number: n, distance: 1, ...over }) as never;

describe('hybrid save: laps (board PlayerSummaryCoverage)', () => {
  it('keeps finished laps as plain records (no aliases, rounded), never the live lap', () => {
    const out = savedLaps([lap(1), lap(2, { isActive: true }), lap(3, { distanceMeters: 0 })]);
    expect(out).toEqual([{ id: 'l1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 349, splitPace: 5.8, isActive: false }]);
    expect(savedLaps(undefined)).toEqual([]);
  });
  it('the doc carries laps only when there are some', () => {
    const result = { summary: { totalActualDistanceKm: 2, totalActualAerobicSec: 700, totalStrengthSets: 6 }, segments: [] } as unknown as HybridFinalizeResult;
    const meta = { userId: 'u', aerobicKind: 'walking' as const, totalCalories: 100 };
    expect(buildHybridWorkoutEntry(result, { ...meta, laps: [lap(1)] }).laps).toHaveLength(1);
    expect('laps' in buildHybridWorkoutEntry(result, meta)).toBe(false);
  });
});
