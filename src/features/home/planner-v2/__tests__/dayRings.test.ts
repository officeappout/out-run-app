/** Planner v2 (enable_week_builder_v1): one day's two rings — minutes by track + steps. */
import { describe, expect, it } from 'vitest';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { ACTIVITY_RING_DAILY_GOAL } from '@/features/home/utils/activity-ring.utils';
import { buildDayRings, dayMinutesByTrack } from '../lib/dayRings';

describe('dayMinutesByTrack', () => {
  it('sums workouts by track and draws the minutes no workout explains as walk', () => {
    const m = dayMinutesByTrack(
      [
        { kind: 'strength', minutes: 35 },
        { kind: 'run', minutes: 30 },
      ],
      { activeMinutes: 80 },
    );
    expect(m).toEqual({ strength: 35, run: 30, walk: 15 });
  });

  it('takes the larger of daily minutes and workouts, never their sum', () => {
    expect(dayMinutesByTrack([{ kind: 'run', minutes: 40 }], { activeMinutes: 25 })).toEqual({ strength: 0, run: 40, walk: 0 });
  });

  it('counts "other" workouts as everyday movement (walk) and ignores bad numbers', () => {
    expect(dayMinutesByTrack([{ kind: 'other', minutes: 12 }, { kind: 'strength', minutes: Number.NaN }], null)).toEqual({ strength: 0, run: 0, walk: 12 });
  });
});

describe('buildDayRings', () => {
  it('splits the outer ring by track colour, scaled to the minutes goal', () => {
    const r = buildDayRings({ minutes: { strength: 10, run: 5, walk: 0 }, steps: 4000, stepGoal: 8000 });
    expect(r.minutesGoal).toBe(ACTIVITY_RING_DAILY_GOAL);
    expect(r.minutesPct).toBeCloseTo(15 / 30);
    expect(r.segments.map((s) => [s.key, s.color])).toEqual([
      ['strength', TRACK_COLORS.strength],
      ['run', TRACK_COLORS.run],
    ]);
    expect(r.arcs[0]).toMatchObject({ key: 'strength', from: 0 });
    expect(r.arcs[0].length).toBeCloseTo(10 / 30);
    expect(r.arcs[1].from).toBeCloseTo(10 / 30);
    expect(r.arcs[1].length).toBeCloseTo(5 / 30);
    expect(r.stepsPct).toBeCloseTo(0.5);
    expect(r.empty).toBe(false);
  });

  it('caps both rings at full and keeps the split proportional', () => {
    const r = buildDayRings({ minutes: { strength: 40, run: 0, walk: 40 }, steps: 12000, stepGoal: 8000 });
    expect(r.minutesPct).toBe(1);
    expect(r.arcs.map((a) => a.length)).toEqual([0.5, 0.5]);
    expect(r.stepsPct).toBe(1);
  });

  it('an empty day: no arcs, empty flag; no step goal → empty inner ring', () => {
    const r = buildDayRings({ minutes: { strength: 0, run: 0, walk: 0 }, steps: 0, stepGoal: 0 });
    expect(r.arcs).toEqual([]);
    expect(r.stepsPct).toBe(0);
    expect(r.empty).toBe(true);
  });
});
