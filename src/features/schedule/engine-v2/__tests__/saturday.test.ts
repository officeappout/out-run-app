import { describe, expect, it } from 'vitest';
import { defaultTrainingDays, saturdayMarked, SATURDAY_DEFAULT_OFF, SATURDAY_DOW } from '..';
import { buildWeek } from '../buildWeek';

describe('Shabbat default (owner 20.10.2026)', () => {
  it('Saturday is off by default, on only when marked', () => {
    expect(SATURDAY_DEFAULT_OFF).toBe(true);
    expect(defaultTrainingDays()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(defaultTrainingDays(true)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(saturdayMarked([1, 3], null, [SATURDAY_DOW])).toBe(true);
    expect(saturdayMarked([0, 5], undefined)).toBe(false);
  });

  it('long run on the default pool lands on the last free non-Saturday day (Friday)', () => {
    const plan = buildWeek({
      availability: { days: defaultTrainingDays(), maxSessionsPerDay: 1, maxTrainingDays: 3 },
      strength: [],
      running: { level: 'intermediate', targetDistance: '10k', sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }] },
      levels: { strength: null, running: 'intermediate' },
    });
    const longDay = plan.days.find((d) => d.sessions.some((s) => s.slot === 'long_run'))?.dow;
    expect(longDay).toBe(5);
    expect(plan.days.find((d) => d.dow === 6)?.sessions.filter((s) => !s.optional && (s.kind === 'run' || s.kind === 'strength')) ?? []).toHaveLength(0);
  });

  it('Saturday marked → the long run may take it', () => {
    const plan = buildWeek({
      availability: { days: [1, 3, 6], maxSessionsPerDay: 1, maxTrainingDays: 3 },
      strength: [],
      running: { level: 'intermediate', targetDistance: '10k', sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }] },
      levels: { strength: null, running: 'intermediate' },
    });
    expect(plan.days.find((d) => d.sessions.some((s) => s.slot === 'long_run'))?.dow).toBe(6);
  });
});
