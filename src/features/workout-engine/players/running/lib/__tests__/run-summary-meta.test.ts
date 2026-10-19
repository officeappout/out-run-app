import { describe, expect, it } from 'vitest';
import { buildRunSummaryMeta, readTimeInZone } from '../run-summary-meta';
import type RunWorkout from '../../types/run-workout.type';
import type { PlannedBlockRecord } from '../../../../core/services/storage.service';

const workout: RunWorkout = {
  id: 'w1',
  title: '6 × 400',
  isQualityWorkout: true,
  category: 'short_intervals',
  slotType: 'quality_primary',
  blocks: [
    { id: 'wu', type: 'warmup', label: 'Warmup', durationSeconds: 600, colorHex: '#000' },
    { id: 'r1', type: 'interval', label: 'Rep', distanceMeters: 400, colorHex: '#000' },
    { id: 'rc', type: 'recovery', label: 'Recovery', durationSeconds: 90, colorHex: '#000' },
    { id: 'r2', type: 'interval', label: 'Rep', distanceMeters: 400, colorHex: '#000' },
    { id: 'cd', type: 'cooldown', label: 'Cooldown', durationSeconds: 480, colorHex: '#000' },
  ],
};

const results = [
  { blockIndex: 0, elapsedSeconds: 610, elapsedMeters: 1700 },
  { blockIndex: 1, elapsedSeconds: 115, elapsedMeters: 400 },
  { blockIndex: 2, elapsedSeconds: 90, elapsedMeters: 150 },
  { blockIndex: 3, elapsedSeconds: 118, elapsedMeters: 402 },
  { blockIndex: 4, elapsedSeconds: 470, elapsedMeters: 1200 },
];

const blockResults: PlannedBlockRecord[] = [
  { blockIndex: 1, rep: 1, label: 'Rep', distanceMeters: 400, durationSeconds: 115, targetMinPaceSec: 285, targetMaxPaceSec: 295 },
  { blockIndex: 3, rep: 2, label: 'Rep', distanceMeters: 402, durationSeconds: 118, targetMinPaceSec: 285, targetMaxPaceSec: 295 },
];

describe('buildRunSummaryMeta', () => {
  it('planned run: category, slot, reps, bands, warm-up / cool-down, plan position', () => {
    const m = buildRunSummaryMeta({
      workout,
      results,
      blockResults,
      trace: [],
      hasKmLaps: false,
      totalKm: 3.85,
      activeSec: 1403,
      plan: { week: 3, day: 2 },
    })!;
    expect(m).toMatchObject({
      category: 'short_intervals',
      slotType: 'quality_primary',
      workoutId: 'w1',
      plannedReps: 2,
      zones: [{ minPaceSec: 285, maxPaceSec: 295 }],
      warmup: { durationSeconds: 610, distanceMeters: 1700 },
      cooldown: { durationSeconds: 470, distanceMeters: 1200 },
      plan: { week: 3, day: 2 },
    });
    expect(m.kmSplits).toBeUndefined();
    expect(m.timeInZone).toBeUndefined();
    // Firestore-safe: no undefined values anywhere.
    expect(JSON.stringify(m)).toBe(JSON.stringify(JSON.parse(JSON.stringify(m))));
    expect(Object.values(m).every((v) => v !== undefined)).toBe(true);
  });

  it('free run with no trace ⇒ null (nothing to save)', () => {
    expect(
      buildRunSummaryMeta({ workout: null, results: [], blockResults: [], trace: [], hasKmLaps: false, totalKm: 5, activeSec: 1800 }),
    ).toBeNull();
  });

  it('keeps the time-in-zone accumulator when present', () => {
    const m = buildRunSummaryMeta({
      workout: null,
      results: [],
      blockResults: [],
      trace: [],
      hasKmLaps: true,
      totalKm: 5,
      activeSec: 1800,
      timeInZone: { inSec: 1500.4, totalSec: 1700 },
    })!;
    expect(m.timeInZone).toEqual({ inSec: 1500, totalSec: 1700 });
  });
});

describe('readTimeInZone', () => {
  it('accepts only a sane { inSec, totalSec }', () => {
    expect(readTimeInZone({ inSec: 10, totalSec: 20 })).toEqual({ inSec: 10, totalSec: 20 });
    expect(readTimeInZone({ inSec: 30, totalSec: 20 })).toEqual({ inSec: 20, totalSec: 20 });
    expect(readTimeInZone({ inSec: 1, totalSec: 0 })).toBeNull();
    expect(readTimeInZone(5)).toBeNull();
    expect(readTimeInZone(undefined)).toBeNull();
  });
});
