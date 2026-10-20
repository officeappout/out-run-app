import { describe, expect, it } from 'vitest';
import { plannedDayFocusOf } from '../planned-day-focus';

const profile = {
  core: { mainGoal: 'muscle_gain' },
  progression: { tracks: { push: { level: 8 }, pull: { level: 8 }, legs: { level: 8 }, core: { level: 6 } } },
  lifestyle: { scheduleDays: ['א', 'ב', 'ד', 'ה'], recurringTemplate: { 'א': ['FULL_BODY'], 'ב': ['FULL_BODY'], 'ד': ['FULL_BODY'], 'ה': ['FULL_BODY'] } },
};

describe('plannedDayFocusOf — the week preview matches the generator', () => {
  it('intermediate full body × 4 → upper / lower by day', () => {
    expect(plannedDayFocusOf({ profile, dateISO: '2026-10-25', programIds: ['FULL_BODY'] })).toBe('upper'); // Sunday
    expect(plannedDayFocusOf({ profile, dateISO: '2026-10-26', programIds: ['FULL_BODY'] })).toBe('lower'); // Monday
  });
  it('an upper-only program on a "lower" day → no focus', () => {
    expect(plannedDayFocusOf({ profile, dateISO: '2026-10-26', programIds: ['UPPER_BODY'] })).toBeNull();
  });
  it('unassessed legs and core → no lower focus', () => {
    const p = { ...profile, progression: { tracks: { push: { level: 8 }, pull: { level: 8 } } } };
    expect(plannedDayFocusOf({ profile: p, dateISO: '2026-10-26', programIds: ['FULL_BODY'] })).toBeNull();
  });
  it('no strength id → null', () => {
    expect(plannedDayFocusOf({ profile, dateISO: '2026-10-25', programIds: ['run-plan'] })).toBeNull();
  });
});
