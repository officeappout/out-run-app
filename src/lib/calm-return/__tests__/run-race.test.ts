/** Race-date adaptation rules (enable_week_builder_v1, owner 22.10). */
import { describe, expect, it } from 'vitest';
import { adaptToRace, compressedVolumeRamp, normalizeRaceGoal, RACE_ADAPT, weeksBetweenKeys } from '../run-race';

const TODAY = '2026-10-22';
const inWeeks = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 7 * 86_400_000).toISOString().slice(0, 10);

describe('adaptToRace', () => {
  it('enough weeks → the plan fits', () => {
    expect(adaptToRace({ todayKey: TODAY, raceDate: inWeeks(10), weeksNeeded: 8, level: 'intermediate' })).toMatchObject({ kind: 'fits', weeksToRace: 10 });
  });

  it('fewer weeks, still safe → compress', () => {
    expect(adaptToRace({ todayKey: TODAY, raceDate: inWeeks(6), weeksNeeded: 8, level: 'intermediate' })).toMatchObject({ kind: 'compress', offerShorterGoal: false });
  });

  it('very little time → finish safely, honest note, shorter goal offered (beginner cap 3, others 2)', () => {
    const b = adaptToRace({ todayKey: TODAY, raceDate: inWeeks(3), weeksNeeded: 4, level: 'beginner' });
    expect(b).toMatchObject({ kind: 'finish_safely', offerShorterGoal: true });
    expect(b.noteHe).toContain('זמן היעד');
    expect(adaptToRace({ todayKey: TODAY, raceDate: inWeeks(3), weeksNeeded: 4, level: 'advanced' }).kind).toBe('compress');
    expect(adaptToRace({ todayKey: TODAY, raceDate: inWeeks(2), weeksNeeded: 4, level: 'advanced' }).kind).toBe('finish_safely');
  });

  it('a compression deeper than the safe share → finish safely', () => {
    expect(adaptToRace({ todayKey: TODAY, raceDate: inWeeks(5), weeksNeeded: 10, level: 'advanced' }).kind).toBe('finish_safely');
  });

  it('weeksBetweenKeys floors, never negative', () => {
    expect(weeksBetweenKeys(TODAY, inWeeks(2))).toBe(2);
    expect(weeksBetweenKeys(inWeeks(2), TODAY)).toBe(0);
  });
});

describe('compressedVolumeRamp', () => {
  it('grows ≤ 10% a week, never past the target, tapers the last week', () => {
    const r = compressedVolumeRamp(100, 130, 5);
    for (let i = 1; i < r.length - 1; i++) expect(r[i]).toBeLessThanOrEqual(Math.round(r[i - 1] * (1 + RACE_ADAPT.maxWeeklyIncrease)) + 1);
    expect(Math.max(...r)).toBeLessThanOrEqual(130);
    expect(r[4]).toBe(Math.round(r[3] * RACE_ADAPT.taperShare));
    expect(compressedVolumeRamp(100, 130, 0)).toEqual([]);
  });
});

describe('normalizeRaceGoal', () => {
  it('accepts a date key only', () => {
    expect(normalizeRaceGoal({ date: '2026-12-01' })).toEqual({ date: '2026-12-01', v: 1 });
    expect(normalizeRaceGoal({ date: 'soon' })).toBeNull();
  });
});
