import { describe, expect, it } from 'vitest';
import {
  buildRunScheduleWrite,
  dayLettersLine,
  daysForFrequency,
  dominantRunWindow,
  recommendRunWeek,
  recommendationTitle,
  runScheduleStepMode,
  runSessionTimes,
  timesLine,
  toggleRunDay,
  windowOfTime,
} from '../runWeekRecommendation';

const base = { level: 'intermediate' as const, targetDistance: '10k' };

describe('recommendRunWeek (engine v2)', () => {
  it('places every slot once, long run on the last chosen day by default', () => {
    const rec = recommendRunWeek({ ...base, slots: ['quality_primary', 'long_run', 'quality_secondary'], days: [0, 2, 5] });
    expect(rec.days.map((d) => d.dow)).toEqual([0, 2, 5]);
    expect(rec.days.map((d) => d.slot).sort()).toEqual(['long_run', 'quality_primary', 'quality_secondary']);
    expect(rec.longRunDow).toBe(5);
  });

  it('honours a chosen long-run day', () => {
    const rec = recommendRunWeek({
      ...base,
      slots: ['quality_primary', 'long_run', 'quality_secondary'],
      days: [0, 2, 5],
      preferredLongRunDay: 2,
    });
    expect(rec.longRunDow).toBe(2);
  });

  it('carries the per-day window (default morning)', () => {
    const rec = recommendRunWeek({ ...base, slots: ['quality_primary', 'long_run'], days: [1, 4], windows: { 1: 'evening' } });
    expect(rec.days.find((d) => d.dow === 1)?.window).toBe('evening');
    expect(rec.days.find((d) => d.dow === 4)?.window).toBe('morning');
  });

  it('empty input → empty week', () => {
    expect(recommendRunWeek({ ...base, slots: [], days: [0] }).days).toEqual([]);
    expect(recommendRunWeek({ ...base, slots: ['long_run'], days: [] }).days).toEqual([]);
  });
});

describe('recommendationTitle', () => {
  it('lists the runs in day order and names the long-run day', () => {
    const title = recommendationTitle({
      days: [
        { dow: 0, slot: 'quality_primary', window: 'morning', reasonHe: null },
        { dow: 2, slot: 'easy_run', window: 'morning', reasonHe: null },
        { dow: 5, slot: 'long_run', window: 'morning', reasonHe: null },
      ],
      longRunDow: 5,
      warningsHe: [],
    });
    expect(title).toBe('3 ריצות: איכות · קלה · ארוכה בשישי');
  });
  it('is empty for an empty week', () => {
    expect(recommendationTitle({ days: [], longRunDow: null, warningsHe: [] })).toBe('');
  });
});

describe('selection rules', () => {
  it('toggleRunDay removes a day but never the last one', () => {
    expect(toggleRunDay([0, 2, 5], 2, 3)).toEqual([0, 5]);
    expect(toggleRunDay([4], 4, 3)).toEqual([4]);
  });
  it('toggleRunDay adds, and replaces the most recent day when full', () => {
    expect(toggleRunDay([0, 5], 2, 3)).toEqual([0, 5, 2]);
    expect(toggleRunDay([0, 5, 2], 3, 3)).toEqual([0, 5, 3]);
  });
  it('daysForFrequency keeps matching days, re-picks otherwise', () => {
    expect(daysForFrequency([1, 3], 2)).toEqual([1, 3]);
    expect(daysForFrequency([1, 3], 3)).toHaveLength(3);
    // avoids strength days when it can
    const picked = daysForFrequency([], 3, [0, 2, 4]);
    expect(picked.filter((d) => [0, 2, 4].includes(d))).toEqual([]);
  });
});

describe('time of day', () => {
  it('windowOfTime maps the presets', () => {
    expect(windowOfTime('07:00')).toBe('morning');
    expect(windowOfTime('19:00')).toBe('evening');
    expect(windowOfTime('08:15')).toBeNull();
  });
  it('dominantRunWindow: majority, tie → earliest day', () => {
    expect(dominantRunWindow([0, 2, 5], { 0: 'evening', 2: 'evening', 5: 'morning' })).toBe('evening');
    expect(dominantRunWindow([1, 4], { 1: 'noon', 4: 'evening' })).toBe('noon');
    expect(dominantRunWindow([], {})).toBe('morning');
  });
  it('timesLine names the days that differ from the main time', () => {
    expect(timesLine([0, 2, 5], { 0: 'evening', 2: 'evening', 5: 'morning' })).toBe('ערב 19:00 · שישי בוקר 07:00');
  });
  it('runSessionTimes gives each day its time', () => {
    expect(runSessionTimes([5, 0], { 5: 'noon' })).toEqual([
      { dow: 0, time: '07:00' },
      { dow: 5, time: '12:30' },
    ]);
  });
  it('dayLettersLine', () => {
    expect(dayLettersLine([5, 0, 2])).toBe('א׳ ג׳ ו׳');
  });
});

describe('buildRunScheduleWrite', () => {
  it('writes the running step fields, user-chosen, merged with strength days', () => {
    expect(buildRunScheduleWrite({ days: [5, 0, 2], windows: { 0: 'evening', 2: 'evening' }, strengthDayLetters: ['ב'] })).toEqual({
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ג', 'ו'],
      runningScheduleDayIndices: [0, 2, 5],
      runningScheduleTime: '19:00',
      scheduleDays: ['ב', 'א', 'ג', 'ו'],
      runningScheduleDaysSource: 'user-chosen',
    });
  });
});

describe('runScheduleStepMode', () => {
  it('run only without strength, add_track with a strength level', () => {
    expect(runScheduleStepMode(null)).toBe('run_only');
    expect(runScheduleStepMode({ progression: { domains: { running: { currentLevel: 2 } } } })).toBe('run_only');
    expect(runScheduleStepMode({ progression: { domains: { full_body: { currentLevel: 3 } } } })).toBe('add_track');
  });
});
