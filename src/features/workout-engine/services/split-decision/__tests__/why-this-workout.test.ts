import { describe, it, expect } from 'vitest';
import { whyLineOfWorkout, whyThisWorkoutHe } from '../why-this-workout';
import { resolveGeneratorDayFocus } from '../day-focus.generator';

describe('whyThisWorkoutHe — the overview reason line (enable_home_v2)', () => {
  it('a steered split day', () => {
    expect(whyThisWorkoutHe({ focus: 'upper', splitHe: 'עליון / תחתון', strengthDaysPerWeek: 4 }))
      .toBe('היום יום עליון בתוכנית עליון / תחתון · 4 ימים בשבוע');
    expect(whyThisWorkoutHe({ focus: 'pull', splitHe: 'דחיפה / משיכה / רגליים', strengthDaysPerWeek: 6 }))
      .toBe('היום יום משיכה בתוכנית דחיפה / משיכה / רגליים · 6 ימים בשבוע');
    expect(whyThisWorkoutHe({ focus: 'lower' })).toBe('היום יום תחתון');
  });
  it('full body', () => {
    expect(whyThisWorkoutHe({ focus: 'full', strengthDaysPerWeek: 3 })).toBe('יום כל הגוף · 3 ימים בשבוע');
    expect(whyThisWorkoutHe({ focus: 'full' })).toBe('יום כל הגוף');
  });
  it('no pull gear wins over the split line', () => {
    expect(whyThisWorkoutHe({ focus: 'upper', splitHe: 'עליון / תחתון', pullGap: 'core' })).toBe('אין מתח בבית — דחיפה + ליבה');
    expect(whyThisWorkoutHe({ focus: 'upper', pullGap: 'bodyweight_pull' })).toBe('אין מתח בבית — משיכה בלי ציוד במקום מתח');
    expect(whyThisWorkoutHe({ focus: 'upper', pullGap: 'push_only' })).toBe('אין מתח בבית — היום בעיקר דחיפה');
    expect(whyThisWorkoutHe({ focus: 'upper', pullGap: 'core', atHome: false })).toBe('אין מתח כאן — דחיפה + ליבה');
    // a lower day never says "no pull bar"
    expect(whyThisWorkoutHe({ focus: 'lower', pullGap: 'core' })).toBe('היום יום תחתון');
  });
  it('complementary sets wins over everything', () => {
    expect(whyThisWorkoutHe({ topUpRemainingSets: 4, focus: 'upper', pullGap: 'core' })).toBe('השלמת סטים · נשארו 4');
    expect(whyThisWorkoutHe({ topUpRemainingSets: 1 })).toBe('השלמת סטים · נשאר סט אחד');
  });
  it('nothing to say → null', () => {
    expect(whyThisWorkoutHe({})).toBeNull();
    expect(whyThisWorkoutHe({ topUpRemainingSets: 0 })).toBeNull();
  });
});

describe('whyLineOfWorkout — from a generated workout + the profile', () => {
  const lvl = (n: number) => ({ tracks: { push: { level: n }, pull: { level: n }, legs: { level: n } } });
  const profile = { progression: lvl(8), lifestyle: { scheduleDays: ['א', 'ב', 'ד', 'ה'] } };
  it('upper day of an upper / lower ×4 week', () => {
    expect(whyLineOfWorkout({ workout: { dayFocus: 'upper' }, profile, location: 'home' }))
      .toBe('היום יום עליון בתוכנית עליון / תחתון · 4 ימים בשבוע');
  });
  it('no focus stamped (flag off / manual) → null', () => {
    expect(whyLineOfWorkout({ workout: {}, profile })).toBeNull();
    expect(whyLineOfWorkout({ workout: null, profile })).toBeNull();
  });
  it('park + no pull → "אין מתח כאן"', () => {
    expect(whyLineOfWorkout({ workout: { dayFocus: 'upper', pullGap: 'core' }, profile, location: 'park' })).toBe('אין מתח כאן — דחיפה + ליבה');
  });
  it('no profile → the focus alone', () => {
    expect(whyLineOfWorkout({ workout: { dayFocus: 'legs' }, profile: null })).toBe('היום יום רגליים');
  });
});

describe('6 strength days → push / pull / legs ×2 drives the day focus', () => {
  const sixDays = { progression: { tracks: { push: { level: 16 }, pull: { level: 16 }, legs: { level: 16 } } }, lifestyle: { scheduleDays: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] } };
  it('advanced, Sun–Fri → push, pull, legs, push, pull, legs', () => {
    const week = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const foci = week.map((d) => resolveGeneratorDayFocus({ enabled: true, profile: sixDays, selectedDate: d, pool: ['full_body'] })?.focus);
    expect(foci).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  });
});
