import { describe, it, expect } from 'vitest';
import { resolveRunningScheduleChange } from '../running-schedule-change.service';

describe('resolveRunningScheduleChange — rule 1 (first-time)', () => {
  it('is "first-time" when oldSource is system-default, same day-count as new', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד', 'ו'],
      currentWeek: 1,
    });
    expect(result.kind).toBe('first-time');
  });

  it('is "first-time" when oldSource is system-default, even with a different day-count (rule 1 beats count-based dispatch)', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: 1,
    });
    expect(result.kind).toBe('first-time');
  });

  it('is "first-time" when oldScheduleDays is empty and oldSource is system-default', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: [],
      newScheduleDays: ['א', 'ג', 'ה'],
      currentWeek: 1,
    });
    expect(result.kind).toBe('first-time');
  });

  it('preserves the current week for an 8-week veteran who predates scheduleDaysSource (first-time is about the choice\'s origin, not the user\'s tenure)', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד', 'ו'],
      currentWeek: 8,
    });
    expect(result.kind).toBe('first-time');
    expect(result.preservedWeek).toBe(8);
  });

  it('does not require an explanation', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד', 'ו'],
      currentWeek: 1,
    });
    expect(result.requiresExplanation).toBe(false);
  });
});

describe('resolveRunningScheduleChange — rule 2 (remap)', () => {
  it('is "remap" when oldSource is user-chosen and day-count is unchanged', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד', 'ו'],
      currentWeek: 4,
    });
    expect(result.kind).toBe('remap');
  });

  it('is "remap" even when the new days are literally identical to the old ones (count-based dispatch, not content-based)', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['א', 'ג', 'ה'],
      currentWeek: 4,
    });
    expect(result.kind).toBe('remap');
  });

  it('does not require an explanation', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ב', 'ד', 'ו'],
      currentWeek: 4,
    });
    expect(result.requiresExplanation).toBe(false);
  });
});

describe('resolveRunningScheduleChange — rule 3 (rebuild)', () => {
  it('is "rebuild" when oldSource is user-chosen and day-count increases', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['א', 'ג', 'ה'],
      currentWeek: 4,
    });
    expect(result.kind).toBe('rebuild');
  });

  it('is "rebuild" when oldSource is user-chosen and day-count decreases', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג', 'ה'],
      newScheduleDays: ['ג'],
      currentWeek: 4,
    });
    expect(result.kind).toBe('rebuild');
  });

  it('requires an explanation', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['א', 'ג', 'ה'],
      currentWeek: 4,
    });
    expect(result.requiresExplanation).toBe(true);
  });
});

describe('resolveRunningScheduleChange — week is always preserved, never reset to 1', () => {
  it.each([
    ['first-time' as const, 'system-default' as const, ['א'], ['ב']],
    ['remap' as const, 'user-chosen' as const, ['א', 'ג'], ['ב', 'ד']],
    ['rebuild' as const, 'user-chosen' as const, ['א'], ['א', 'ג', 'ה']],
  ])('preserves currentWeek=12 for kind=%s', (_label, oldSource, oldDays, newDays) => {
    const result = resolveRunningScheduleChange({
      oldSource,
      oldScheduleDays: oldDays,
      newScheduleDays: newDays,
      currentWeek: 12,
    });
    expect(result.preservedWeek).toBe(12);
  });

  it('preserves week 1 as 1 (not a special reset case, just the input value)', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: 1,
    });
    expect(result.preservedWeek).toBe(1);
  });

  it('clamps a zero currentWeek to 1 rather than propagating an invalid week', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: 0,
    });
    expect(result.preservedWeek).toBe(1);
  });

  it('clamps a negative currentWeek to 1', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: -3,
    });
    expect(result.preservedWeek).toBe(1);
  });

  it('clamps a NaN currentWeek to 1', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: NaN,
    });
    expect(result.preservedWeek).toBe(1);
  });

  it('truncates a non-integer currentWeek rather than rounding', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'user-chosen',
      oldScheduleDays: ['א', 'ג'],
      newScheduleDays: ['ב', 'ד'],
      currentWeek: 3.9,
    });
    expect(result.preservedWeek).toBe(3);
  });
});

describe('resolveRunningScheduleChange — never blocks', () => {
  it('returns a decision (does not throw) for empty old and new day arrays', () => {
    expect(() =>
      resolveRunningScheduleChange({
        oldSource: 'user-chosen',
        oldScheduleDays: [],
        newScheduleDays: [],
        currentWeek: 4,
      }),
    ).not.toThrow();
  });

  it('always returns one of the three known kinds', () => {
    const result = resolveRunningScheduleChange({
      oldSource: 'system-default',
      oldScheduleDays: [],
      newScheduleDays: [],
      currentWeek: 1,
    });
    expect(['first-time', 'remap', 'rebuild']).toContain(result.kind);
  });
});
