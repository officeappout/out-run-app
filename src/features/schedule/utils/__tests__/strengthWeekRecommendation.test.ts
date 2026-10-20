import { describe, expect, it } from 'vitest';
import type { PrioritizedSkill } from '../../types/smartSchedule.types';
import {
  buildStrengthScheduleWrite,
  distributeSessions,
  dominantWindow,
  recommendStrengthFrequency,
  recommendStrengthWeek,
  recommendedStrengthDays,
  strengthItemCounts,
  strengthMainItems,
  strengthPlanLine,
  strengthRecommendationTitle,
  strengthReminderSubtitle,
  strengthSessionTimes,
  strengthTrainingLevel,
  strengthWhyLine,
  windowForTime,
  type StrengthSeed,
} from '../strengthWeekRecommendation';

const skill = (id: PrioritizedSkill['id'], priority: number): PrioritizedSkill => ({
  id,
  priority,
  movementType: 'PUSH',
  isFreeSlot: id === 'HANDSTAND',
  minRestHours: 48,
  countsTowardCap: id !== 'HANDSTAND',
});

const FULL_BODY: StrengthSeed = { programs: ['FULL_BODY'], skills: [] };
const PLANCHE_FL: StrengthSeed = { programs: [], skills: [skill('PLANCHE', 1), skill('FRONT_LEVER', 2)] };

describe('strength recommendation — Q1 count', () => {
  it('3 days by default (today\'s RECOMMENDED_FREQUENCY)', () => {
    expect(recommendStrengthFrequency({ seed: FULL_BODY })).toEqual({ frequency: 3, personaNoteHe: null });
  });

  it('persona moves the number, with a note', () => {
    expect(recommendStrengthFrequency({ seed: FULL_BODY, personaIds: ['vatikim'] })).toEqual({ frequency: 2, personaNoteHe: 'מותאם לגיל הזהב' });
    expect(recommendStrengthFrequency({ seed: FULL_BODY, personaIds: ['office_worker', 'pro_athlete'] }).frequency).toBe(4);
  });

  it('never below the hard-skill minimum (ERR_DAYS_MIN table)', () => {
    const three = { programs: [], skills: [skill('PLANCHE', 1), skill('FRONT_LEVER', 2), skill('OAPU', 3)] } as StrengthSeed;
    expect(recommendStrengthFrequency({ seed: three, personaIds: ['vatikim'] })).toEqual({ frequency: 4, personaNoteHe: null });
  });

  it('main items: skills first (handstand never main), else the first program, else upper body', () => {
    expect(strengthMainItems(FULL_BODY)).toEqual(['FULL_BODY']);
    expect(strengthMainItems({ programs: ['UPPER_BODY'], skills: [skill('HANDSTAND', 1)] })).toEqual(['UPPER_BODY']);
    expect(strengthMainItems({ programs: [], skills: [skill('FRONT_LEVER', 2), skill('PLANCHE', 1)] })).toEqual(['PLANCHE', 'FRONT_LEVER']);
    expect(strengthMainItems({ programs: [], skills: [] })).toEqual(['UPPER_BODY']);
  });

  it('distributes sessions by priority', () => {
    expect(distributeSessions(['PLANCHE', 'FRONT_LEVER'], 5)).toEqual([3, 2]);
    expect(distributeSessions(['FULL_BODY'], 3)).toEqual([3]);
  });

  it('level mapping and copy', () => {
    expect(strengthTrainingLevel(4)).toBe('beginner');
    expect(strengthTrainingLevel(9)).toBe('intermediate');
    expect(strengthTrainingLevel(20)).toBe('advanced');
    expect(strengthTrainingLevel(undefined)).toBe('beginner');
    expect(strengthWhyLine({ level: 4, recoveryHours: 48 })).toBe('רמה 4 · 48 שעות התאוששות בין אימונים');
    expect(strengthWhyLine({ level: null, recoveryHours: 48, personaNoteHe: 'מותאם לגיל הזהב' })).toBe('מותאם לגיל הזהב · 48 שעות התאוששות בין אימונים');
    expect(strengthPlanLine(FULL_BODY)).toBe('כוח · כל הגוף');
  });
});

describe('strength recommendation — engine v2 days', () => {
  it('full body ×3 → Sun / Tue / Thu, never Saturday', () => {
    const days = recommendedStrengthDays(FULL_BODY, 3, 'beginner');
    expect(days).toEqual([0, 2, 4]);
    expect(strengthRecommendationTitle(FULL_BODY, days)).toBe('3 ימים בשבוע · כוח מלא א׳ / ג׳ / ה׳');
  });

  it('every count gets exactly that many days; Saturday only for 7', () => {
    for (let n = 1; n <= 6; n++) {
      const days = recommendedStrengthDays(FULL_BODY, n, 'intermediate');
      expect(days).toHaveLength(n);
      expect(days).not.toContain(6);
    }
    expect(recommendedStrengthDays(FULL_BODY, 7, 'advanced')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('week on the chosen days: reasons per day, windows kept', () => {
    const week = recommendStrengthWeek({ seed: FULL_BODY, frequency: 3, days: [0, 2, 4], windows: { 2: 'morning' }, level: 'beginner' });
    expect(week.days.map((d) => d.dow)).toEqual([0, 2, 4]);
    expect(week.days.map((d) => d.items)).toEqual([['FULL_BODY'], ['FULL_BODY'], ['FULL_BODY']]);
    expect(week.days.map((d) => d.reasonHe)).toEqual(['אימון ראשון בשבוע', '48 שעות בין אימוני כוח', '48 שעות בין אימוני כוח']);
    expect(week.days.map((d) => d.window)).toEqual(['evening', 'morning', 'evening']);
    expect(week.recoveryHours).toBe(48);
    expect(strengthItemCounts(week)).toEqual([{ id: 'FULL_BODY', count: 3 }]);
    expect(strengthReminderSubtitle(week)).toBe('3 אימוני כוח בשבוע · א׳ ג׳ ה׳');
    expect(strengthSessionTimes(week)).toEqual([
      { dow: 0, time: '19:00' },
      { dow: 2, time: '07:00' },
      { dow: 4, time: '19:00' },
    ]);
  });

  it('back-to-back days say so instead of claiming full recovery', () => {
    const week = recommendStrengthWeek({ seed: FULL_BODY, frequency: 2, days: [0, 1], level: 'beginner' });
    expect(week.days.map((d) => d.reasonHe)).toEqual(['אימון ראשון בשבוע', '24 שעות מהאימון הקודם']);
    expect(strengthReminderSubtitle(week)).toBe('2 אימוני כוח בשבוע · א׳ ב׳ ערב');
  });

  it('two skills alternate; handstand rides along first', () => {
    const seed: StrengthSeed = { programs: [], skills: [...PLANCHE_FL.skills, skill('HANDSTAND', 3)] };
    const week = recommendStrengthWeek({ seed, frequency: 4, days: [0, 2, 4, 5], level: 'intermediate' });
    expect(week.days).toHaveLength(4);
    for (const d of week.days) expect(d.items[0]).toBe('HANDSTAND');
    const counts = strengthItemCounts(week);
    expect(counts.find((c) => c.id === 'PLANCHE')?.count).toBe(2);
    expect(counts.find((c) => c.id === 'FRONT_LEVER')?.count).toBe(2);
  });

  it('no days → empty week (never throws)', () => {
    expect(recommendStrengthWeek({ seed: FULL_BODY, frequency: 3, days: [], level: 'beginner' }).days).toEqual([]);
  });
});

describe('strength recommendation — time of day', () => {
  it('maps any time to a window', () => {
    expect(windowForTime('06:30')).toBe('morning');
    expect(windowForTime('12:30')).toBe('noon');
    expect(windowForTime('18:00')).toBe('evening');
    expect(windowForTime('bad')).toBeNull();
    expect(windowForTime(undefined)).toBeNull();
  });

  it('dominant window, tie → earliest day', () => {
    expect(dominantWindow([0, 2, 4], { 0: 'morning', 2: 'evening', 4: 'evening' }, 'evening')).toBe('evening');
    expect(dominantWindow([0, 2], { 0: 'morning', 2: 'evening' }, 'evening')).toBe('morning');
    expect(dominantWindow([], {}, 'noon')).toBe('noon');
  });
});

describe('strength recommendation — save payload (ScheduleStep fields)', () => {
  it('writes the same fields ScheduleStep writes, from the engine week', () => {
    const week = recommendStrengthWeek({ seed: FULL_BODY, frequency: 3, days: [0, 2, 4], windows: { 0: 'morning', 2: 'morning' }, level: 'beginner' });
    expect(buildStrengthScheduleWrite({ week, historyFrequency: '1-2' })).toEqual({
      trainingDays: 3,
      trainingTime: '07:00',
      scheduleDayIndices: [0, 2, 4],
      scheduleDays: ['א', 'ג', 'ה'],
      recurringTemplate: { 'א': ['FULL_BODY'], 'ג': ['FULL_BODY'], 'ה': ['FULL_BODY'] },
      scheduleGridSessions: [
        { dayOfWeek: 0, skillIds: ['FULL_BODY'] },
        { dayOfWeek: 1, skillIds: [] },
        { dayOfWeek: 2, skillIds: ['FULL_BODY'] },
        { dayOfWeek: 3, skillIds: [] },
        { dayOfWeek: 4, skillIds: ['FULL_BODY'] },
        { dayOfWeek: 5, skillIds: [] },
        { dayOfWeek: 6, skillIds: [] },
      ],
      historyFrequency: '1-2',
    });
  });

  it('leaves historyFrequency out when the optional chip was not answered', () => {
    const week = recommendStrengthWeek({ seed: FULL_BODY, frequency: 2, days: [1, 3], level: 'beginner' });
    const write = buildStrengthScheduleWrite({ week, historyFrequency: null });
    expect('historyFrequency' in write).toBe(false);
    expect(write.trainingTime).toBe('19:00');
  });
});
