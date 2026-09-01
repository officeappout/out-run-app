import { describe, it, expect } from 'vitest';
import { resolveRunningScheduleChange, mergePreservedHistory } from '../running-schedule-change.service';

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

describe('mergePreservedHistory', () => {
  const COMPLETED_ENTRY = {
    week: 3,
    day: 1,
    workoutId: 'tpl_easy_1_w3',
    status: 'completed' as const,
    category: 'easy_run' as const,
    workoutName: 'Easy Run',
    actualPerformance: { avgPace: 320, completionRate: 0.95 },
  };

  it('a completed entry with actualPerformance survives byte-for-byte when its week is before preservedWeek', () => {
    const oldSchedule = [COMPLETED_ENTRY];
    const newSchedule = [{ week: 3, day: 1, workoutId: 'tpl_easy_2_w3', status: 'pending' as const }];
    const merged = mergePreservedHistory(oldSchedule, newSchedule, 6);
    expect(merged).toContainEqual(COMPLETED_ENTRY);
    expect(merged.find((e) => e.week === 3)).toEqual(COMPLETED_ENTRY);
  });

  it('preservedWeek=1 (first-time choice) preserves nothing -- the entire result comes from newSchedule', () => {
    const oldSchedule = [COMPLETED_ENTRY, { ...COMPLETED_ENTRY, week: 1, workoutId: 'tpl_easy_1_w1' }];
    const newSchedule = [
      { week: 1, day: 1, workoutId: 'tpl_new_w1', status: 'pending' as const },
      { week: 2, day: 1, workoutId: 'tpl_new_w2', status: 'pending' as const },
    ];
    const merged = mergePreservedHistory(oldSchedule, newSchedule, 1);
    expect(merged).toEqual(newSchedule);
  });

  it('a week below preservedWeek that never existed in oldSchedule does not crash or invent entries', () => {
    const oldSchedule = [{ week: 5, day: 1, workoutId: 'tpl_x_w5', status: 'completed' as const }];
    const newSchedule = [{ week: 6, day: 1, workoutId: 'tpl_y_w6', status: 'pending' as const }];
    // preservedWeek=6, but oldSchedule has nothing for week < 6 except week 5 -- that one entry
    // is preserved; no phantom entry for e.g. week 1-4 is invented.
    const merged = mergePreservedHistory(oldSchedule, newSchedule, 6);
    expect(merged).toEqual([
      { week: 5, day: 1, workoutId: 'tpl_x_w5', status: 'completed' },
      { week: 6, day: 1, workoutId: 'tpl_y_w6', status: 'pending' },
    ]);
  });

  it('entries at exactly preservedWeek come from newSchedule, not oldSchedule (boundary is >=, not >)', () => {
    const oldSchedule = [{ week: 6, day: 1, workoutId: 'old_w6', status: 'completed' as const }];
    const newSchedule = [{ week: 6, day: 1, workoutId: 'new_w6', status: 'pending' as const }];
    const merged = mergePreservedHistory(oldSchedule, newSchedule, 6);
    expect(merged).toEqual([{ week: 6, day: 1, workoutId: 'new_w6', status: 'pending' }]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(mergePreservedHistory([], [], 3)).toEqual([]);
  });

  it('old weeks at/above preservedWeek that no longer exist in a shorter newSchedule are dropped, not carried over as orphans -- generic function, not guaranteed a same-length input by its own contract', () => {
    // Today totalWeeks is always preserved by buildRunningPlan (David,
    // 01.09.2026), so oldSchedule/newSchedule are same-length in practice --
    // but mergePreservedHistory is pure and general, callable with any
    // input, so its own behavior for a shortened program must still be
    // predictable and documented, not just "whatever happens to fall out."
    const oldSchedule = [
      { week: 5, day: 1, workoutId: 'old_w5', status: 'completed' as const },
      { week: 9, day: 1, workoutId: 'old_w9', status: 'pending' as const },
      { week: 12, day: 1, workoutId: 'old_w12', status: 'pending' as const },
    ];
    // newSchedule only goes up to week 8 -- shorter than the old 12-week program.
    const newSchedule = [
      { week: 6, day: 1, workoutId: 'new_w6', status: 'pending' as const },
      { week: 8, day: 1, workoutId: 'new_w8', status: 'pending' as const },
    ];
    const merged = mergePreservedHistory(oldSchedule, newSchedule, 6);
    // Week 5 (< preservedWeek) is preserved from old. Weeks 9 and 12 (>=
    // preservedWeek) existed only in the old, longer program -- they are
    // NOT invented in the result just because old had them; only what
    // newSchedule actually contains at/above preservedWeek appears.
    expect(merged).toEqual([
      { week: 5, day: 1, workoutId: 'old_w5', status: 'completed' },
      { week: 6, day: 1, workoutId: 'new_w6', status: 'pending' },
      { week: 8, day: 1, workoutId: 'new_w8', status: 'pending' },
    ]);
  });
});
