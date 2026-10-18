import { describe, it, expect } from 'vitest';
import { resolveSignupDefaultWrite } from '../running-schedule-signup-default';

describe('resolveSignupDefaultWrite', () => {
  it('isJIT=true -> null, regardless of hydration -- the interactive picker owns that case entirely', () => {
    expect(resolveSignupDefaultWrite({ isJIT: true, hasHydrated: true, strengthDays: ['ב', 'ד'] })).toBeNull();
    expect(resolveSignupDefaultWrite({ isJIT: true, hasHydrated: false, strengthDays: [] })).toBeNull();
  });

  it('the hydration bug this exists to close: profile not yet hydrated at mount -> null, not a write with empty strengthDays', () => {
    // Real mount-time shape: profile is still loading, strengthDays derived
    // from it is necessarily [] at this exact moment.
    const atMount = resolveSignupDefaultWrite({ isJIT: false, hasHydrated: false, strengthDays: [] });
    expect(atMount).toBeNull();
  });

  it('profile arrives after mount (hasHydrated flips true, strengthDays now real): the write includes BOTH the real strength days and the new running defaults', () => {
    const afterHydration = resolveSignupDefaultWrite({
      isJIT: false,
      hasHydrated: true,
      strengthDays: ['ב', 'ד'], // real strength days, only known once profile hydrated
    });

    expect(afterHydration).not.toBeNull();
    expect(afterHydration!.scheduleDays).toEqual(expect.arrayContaining(['ב', 'ד']));
    // And the running defaults are still in there too -- not a strength-only write.
    expect(afterHydration!.scheduleDays.length).toBeGreaterThan(2);
    expect(afterHydration!.runningScheduleDaysSource).toBe('system-default');
  });

  it('no strength days at all (pure-runner signup, real case) still resolves a full payload once hydrated', () => {
    const result = resolveSignupDefaultWrite({ isJIT: false, hasHydrated: true, strengthDays: [] });
    expect(result).not.toBeNull();
    expect(result!.scheduleDays).toEqual(result!.runningScheduleDays);
  });
});

describe('resolveSignupDefaultWrite — strength-aware days', () => {
  it('run days never collide with the existing strength days; time and source unchanged', () => {
    const r = resolveSignupDefaultWrite({ isJIT: false, hasHydrated: true, strengthDays: ['א', 'ג', 'ה'] });
    expect(r).not.toBeNull();
    expect(r!.runningScheduleDays).toEqual(['ב', 'ד', 'ו']);
    expect(r!.runningScheduleDayIndices).toEqual([1, 3, 5]);
    expect(r!.runningScheduleTime).toBe('07:00');
    expect(r!.runningScheduleDaysSource).toBe('system-default');
    expect(r!.runningWeeklyFrequency).toBe(3);
    expect([...r!.scheduleDays].sort()).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו']);
  });
});
