import { describe, it, expect } from 'vitest';
import { resolveDefaultRunningSchedule } from '../running-schedule-defaults';
import { getSmartDefaultDays } from '../running-schedule-smart-defaults';

describe('resolveDefaultRunningSchedule', () => {
  it('returns frequency=3 with the matching smart-default days (Sun/Tue/Thu), independent of profile', () => {
    const result = resolveDefaultRunningSchedule();
    expect(result.frequency).toBe(3);
    expect(result.dayIndices).toEqual(getSmartDefaultDays(3));
  });

  it('a profile with no strength days gives exactly the previous default', () => {
    const withProfile = resolveDefaultRunningSchedule({} as any);
    const withoutProfile = resolveDefaultRunningSchedule();
    const withNull = resolveDefaultRunningSchedule(null);
    const emptyLifestyle = resolveDefaultRunningSchedule({ lifestyle: { scheduleDays: [], recurringTemplate: { 'א': [] } } });
    expect(withProfile).toEqual(withoutProfile);
    expect(withNull).toEqual(withoutProfile);
    expect(emptyLifestyle).toEqual(withoutProfile);
  });

  it('avoids the profile strength days (lifestyle.scheduleDays) -- Sun/Tue/Thu strength -> Mon/Wed/Fri runs', () => {
    const r = resolveDefaultRunningSchedule({ lifestyle: { scheduleDays: ['א', 'ג', 'ה'] } });
    expect(r.frequency).toBe(3);
    expect(r.dayIndices).toEqual([1, 3, 5]);
  });

  it('reads recurringTemplate days that carry a program, and the caller-supplied strength days', () => {
    const r = resolveDefaultRunningSchedule(
      { lifestyle: { recurringTemplate: { 'א': ['p1'], 'ד': [] } } },
      ['ג'],
    );
    // Strength = Sun + Tue ('ד' is an explicit rest day, not strength).
    expect(r.dayIndices.filter((d) => d === 0 || d === 2)).toEqual([]);
    expect(r.dayIndices).toHaveLength(3);
  });

  it('dayIndices.length matches frequency -- the same invariant getSmartDefaultDays itself guarantees', () => {
    const { frequency, dayIndices } = resolveDefaultRunningSchedule();
    expect(dayIndices).toHaveLength(frequency);
  });
});
