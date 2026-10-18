import { describe, expect, it } from 'vitest';
import {
  buildWeekDots,
  deltaLabel,
  formatGain,
  improvementHeadline,
  isTrainingDay,
  programRingModel,
  toneFor,
  tonesPresent,
} from '../summary';

describe('toneFor', () => {
  it('missed when nothing was done', () => {
    expect(toneFor(null, 10)).toBe('missed');
    expect(toneFor(0, 10)).toBe('missed');
  });
  it('in / below against the target', () => {
    expect(toneFor(10, 10)).toBe('in');
    expect(toneFor(12, 10)).toBe('in');
    expect(toneFor(9, 10)).toBe('below');
  });
  it('no target ⇒ in', () => {
    expect(toneFor(5, null)).toBe('in');
  });
});

describe('tonesPresent', () => {
  it('returns legend order, deduped', () => {
    expect(
      tonesPresent([
        { value: '–', tone: 'missed' },
        { value: '8', tone: 'in' },
        { value: '6', tone: 'below' },
        { value: '8', tone: 'in' },
      ]),
    ).toEqual(['in', 'below', 'missed']);
  });
});

describe('programRingModel', () => {
  it('splits base and today’s gain', () => {
    expect(programRingModel(80, 3.2, false)).toEqual({ percent: 80, basePercent: 76.8, gainPercent: 3.2 });
  });
  it('a level-up restarts the ring — everything in the new level is today', () => {
    expect(programRingModel(4, 9, true)).toEqual({ percent: 4, basePercent: 0, gainPercent: 4 });
  });
  it('gain never exceeds the current percent, clamps bad input', () => {
    expect(programRingModel(2, 5, false)).toEqual({ percent: 2, basePercent: 0, gainPercent: 2 });
    expect(programRingModel(140, -1, false)).toEqual({ percent: 100, basePercent: 100, gainPercent: 0 });
    expect(programRingModel(NaN, NaN, false)).toEqual({ percent: 0, basePercent: 0, gainPercent: 0 });
  });
});

describe('formatGain', () => {
  it('one decimal with a plus', () => {
    expect(formatGain(3.24)).toBe('+3.2%');
    expect(formatGain(0)).toBeNull();
  });
});

describe('buildWeekDots', () => {
  // Wednesday 14.10.2026
  const today = new Date(2026, 9, 14, 18, 0);
  const day = (minutes: number, sessions = 0) => ({ categories: { strength: { minutes, sessions } } });

  it('Sunday first, labels, today, future days', () => {
    const dots = buildWeekDots({}, today);
    expect(dots.map((d) => d.label)).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']);
    expect(dots[0].date).toBe('2026-10-11');
    expect(dots.findIndex((d) => d.isToday)).toBe(3);
    expect(dots.map((d) => d.state)).toEqual(['rest', 'rest', 'rest', 'rest', 'future', 'future', 'future']);
  });

  it('marks training days and chains consecutive ones', () => {
    const dots = buildWeekDots(
      { '2026-10-11': day(30, 1), '2026-10-13': day(12), '2026-10-12': day(4) },
      today,
      { todayDone: true },
    );
    expect(dots.map((d) => d.state).slice(0, 4)).toEqual(['done', 'rest', 'done', 'done']);
    expect(dots.map((d) => d.chainToNext).slice(0, 4)).toEqual([false, false, true, false]);
  });

  it('todayDone off leaves today as logged', () => {
    expect(buildWeekDots({}, today)[3].state).toBe('rest');
  });

  it('isTrainingDay: a session or ≥10 minutes', () => {
    expect(isTrainingDay(day(0, 1))).toBe(true);
    expect(isTrainingDay(day(10))).toBe(true);
    expect(isTrainingDay(day(9))).toBe(false);
    expect(isTrainingDay(undefined)).toBe(false);
  });
});

describe('improvementHeadline / deltaLabel', () => {
  it('sums one unit', () => {
    expect(improvementHeadline([{ delta: 1, unit: 'reps' }, { delta: 2, unit: 'reps' }])).toEqual({ value: '+3', unit: 'חזרות' });
    expect(improvementHeadline([{ delta: 1, unit: 'reps' }])).toEqual({ value: '+1', unit: 'חזרה' });
    expect(improvementHeadline([{ delta: 5, unit: 'seconds' }])).toEqual({ value: '+5', unit: 'שנ׳' });
  });
  it('mixed units ⇒ count of items', () => {
    expect(improvementHeadline([{ delta: 1, unit: 'reps' }, { delta: 5, unit: 'seconds' }])).toEqual({ value: '2', unit: 'תרגילים' });
  });
  it('empty ⇒ null', () => {
    expect(improvementHeadline([])).toBeNull();
  });
  it('labels', () => {
    expect(deltaLabel(1, 'reps')).toBe('+1 חזרה');
    expect(deltaLabel(2, 'reps')).toBe('+2 חזרות');
    expect(deltaLabel(5, 'seconds')).toBe('+5 שנ׳');
    expect(deltaLabel(3, 'unknown')).toBe('+3');
  });
});
