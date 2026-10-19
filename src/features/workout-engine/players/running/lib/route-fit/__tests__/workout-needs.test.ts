import { describe, expect, it } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import { buildWorkoutRouteNeeds } from '../workout-needs';
import { isRunAfterDark, solarAltitudeDeg } from '../sun';
import { ORIGIN } from './fixtures';

const ctx = { basePace: 360, zones: null };
const blk = (b: Partial<RunBlock>): RunBlock => ({ id: Math.random().toString(36), type: 'run', label: '', colorHex: '#000', ...b });

describe('buildWorkoutRouteNeeds', () => {
  it('easy run: kind, km, no hill', () => {
    const n = buildWorkoutRouteNeeds({ blocks: [blk({ durationSeconds: 1800 })], category: 'easy_run' }, ctx);
    expect(n.kind).toBe('easy');
    expect(n.hill).toBeNull();
    expect(n.targetKm).toBeGreaterThan(3);
    expect(n.durationMin).toBe(30);
    expect(n.afterDark).toBe(false);
  });

  it('hill_short by category: rep length from distance, default grade', () => {
    const reps = Array.from({ length: 6 }, () => blk({ type: 'interval', distanceMeters: 200, blockMode: 'effort' }));
    const n = buildWorkoutRouteNeeds({ blocks: [blk({ type: 'warmup', durationSeconds: 600 }), ...reps], category: 'hill_short' }, ctx);
    expect(n.hill).toEqual({ repLengthM: 200, minGradePct: 4, reps: 6 });
  });

  it('inclinePercent on the block wins; timed reps converted to metres', () => {
    const reps = Array.from({ length: 8 }, () =>
      blk({ type: 'interval', durationSeconds: 20, blockMode: 'effort', effortConfig: { effortLevel: 'max', inclinePercent: 8 } }));
    const n = buildWorkoutRouteNeeds({ blocks: reps, category: null }, { basePace: 0, zones: null });
    expect(n.hill).toEqual({ repLengthM: 80, minGradePct: 8, reps: 8 });
  });

  it('afterDark from the start time and place', () => {
    const night = new Date('2026-12-21T17:00:00Z'); // 19:00 in Israel, dark
    const n = buildWorkoutRouteNeeds({ blocks: [blk({ durationSeconds: 1800 })] }, ctx, { startAt: night, origin: ORIGIN });
    expect(n.afterDark).toBe(true);
  });
});

describe('sun', () => {
  it('noon in Tel Aviv is high, a December evening is dark', () => {
    expect(solarAltitudeDeg(new Date('2026-06-21T09:40:00Z'), ORIGIN.lat, ORIGIN.lng)).toBeGreaterThan(75);
    expect(isRunAfterDark(new Date('2026-12-21T17:00:00Z'), 30, ORIGIN)).toBe(true);
    expect(isRunAfterDark(new Date('2026-06-21T05:00:00Z'), 40, ORIGIN)).toBe(false);
  });

  it('a run that starts before sunset but ends after it counts as after dark', () => {
    // Tel Aviv sunset on 21.12 ≈ 14:45 UTC
    expect(isRunAfterDark(new Date('2026-12-21T14:20:00Z'), 60, ORIGIN)).toBe(true);
    expect(isRunAfterDark(new Date('2026-12-21T12:00:00Z'), 30, ORIGIN)).toBe(false);
  });
});
