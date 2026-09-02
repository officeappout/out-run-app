import { describe, it, expect } from 'vitest';
import { resolveDefaultRunningSchedule } from '../running-schedule-defaults';
import { getSmartDefaultDays } from '../running-schedule-smart-defaults';

describe('resolveDefaultRunningSchedule', () => {
  it('returns frequency=3 with the matching smart-default days (Sun/Tue/Thu), independent of profile', () => {
    const result = resolveDefaultRunningSchedule();
    expect(result.frequency).toBe(3);
    expect(result.dayIndices).toEqual(getSmartDefaultDays(3));
  });

  it('ignores profile entirely -- documented extension point, not wired yet', () => {
    const withProfile = resolveDefaultRunningSchedule({} as any);
    const withoutProfile = resolveDefaultRunningSchedule();
    const withNull = resolveDefaultRunningSchedule(null);
    expect(withProfile).toEqual(withoutProfile);
    expect(withNull).toEqual(withoutProfile);
  });

  it('dayIndices.length matches frequency -- the same invariant getSmartDefaultDays itself guarantees', () => {
    const { frequency, dayIndices } = resolveDefaultRunningSchedule();
    expect(dayIndices).toHaveLength(frequency);
  });
});
