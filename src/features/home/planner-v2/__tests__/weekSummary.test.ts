/** Planner v2 (enable_week_builder_v1): the week section's numbers. */
import { describe, expect, it } from 'vitest';
import { planLineOf, sundayOfKey, weekProgress } from '../lib/weekSummary';

const week = {
  days: [
    { sessions: [{ track: 'run' as const, status: 'done' as const }, { track: 'strength' as const, status: 'done' as const }] },
    { sessions: [] },
    { sessions: [{ track: 'strength' as const }] },
    { sessions: [{ track: 'run' as const, status: 'missed' as const }] },
    { sessions: [{ track: 'strength' as const }] },
    { sessions: [{ track: 'run' as const }] },
    { sessions: [] },
  ],
};

describe('week summary', () => {
  it('done / planned counts every session once', () => {
    expect(weekProgress(week)).toEqual({ done: 2, total: 6 });
  });

  it('the plan line: tracks in order with their counts', () => {
    expect(planLineOf(week)).toEqual({ tracks: ['strength', 'run'], counts: [3, 3] });
  });

  it('the Sunday of a date\'s week, across a month edge', () => {
    expect(sundayOfKey('2026-11-03')).toBe('2026-11-01');
    expect(sundayOfKey('2026-10-31')).toBe('2026-10-25');
    expect(sundayOfKey('2026-10-25')).toBe('2026-10-25');
  });
});
