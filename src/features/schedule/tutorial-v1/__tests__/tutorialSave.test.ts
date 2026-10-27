import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { DAY_LETTERS_HE } from '@/features/schedule/utils/runWeekRecommendation';
import { initialDays, setDayTime } from '../model/days';
import { buildTutorialWeek, type TutorialWeekInput } from '../model/tutorialWeek';
import { mergedStrengthTemplate, strengthTimesByDay, tutorialSaveFields } from '../model/tutorialSave';

const [SUN, MON, TUE, WED, THU] = DAY_LETTERS_HE;

const input = (over: Partial<TutorialWeekInput> = {}): TutorialWeekInput => ({
  seed: { programs: ['FULL_BODY'], skills: [] },
  levels: { push: 3, pull: 3, legs: 3 },
  engineLevel: 'beginner',
  days: setDayTime(initialDays([0, 2, 4], 'evening'), 2, '06:15'),
  minutes: 45,
  running: null,
  twoPerDay: false,
  longRunDay: null,
  stepsGoal: 6000,
  ...over,
});

describe('tutorial save fields (Part C)', () => {
  const week = buildTutorialWeek(input());
  const strengthDows = week.days.filter((d) => d.strength).map((d) => d.dow);

  it('per-day times: the exact time where set, the window preset elsewhere', () => {
    const times = strengthTimesByDay(week);
    expect(Object.keys(times).sort()).toEqual(strengthDows.map((d) => DAY_LETTERS_HE[d]).sort());
    if (strengthDows.includes(2)) expect(times[TUE]).toBe('06:15');
    if (strengthDows.includes(0)) expect(times[SUN]).toBe('19:00');
  });

  it('template: strength items on the week days, running ids kept, stale strength ids dropped, explicit rest kept', () => {
    const t = mergedStrengthTemplate({ [MON]: ['FULL_BODY'], [WED]: ['run_prog_123'], [THU]: [] }, { days: [] });
    expect(t[MON]).toBeUndefined();
    expect(t[WED]).toEqual(['run_prog_123']);
    expect(t[THU]).toEqual([]);
    const full = mergedStrengthTemplate({ [SUN]: ['run_prog_123'] }, week);
    for (const d of strengthDows) expect(full[DAY_LETTERS_HE[d]]).toEqual(expect.arrayContaining(week.days.find((x) => x.dow === d)!.strength!.items));
    if (strengthDows.includes(0)) expect(full[SUN][0]).toBe('run_prog_123');
  });

  it('dotted fields: only the new optional fields + the existing template / time, runner fields only for runners', () => {
    const f = tutorialSaveFields({ week, existingTemplate: null, trainingTime: '19:00', sessionMinutes: 45, running: null });
    expect(Object.keys(f).sort()).toEqual([
      'lifestyle.recurringTemplate', 'lifestyle.reminders.strengthTimesByDay', 'lifestyle.sessionMinutes', 'lifestyle.trainingTime',
    ]);
    expect(f['lifestyle.sessionMinutes']).toBe(45);
    const r = tutorialSaveFields({ week, existingTemplate: null, trainingTime: '19:00', sessionMinutes: 30, running: { longRunDay: 4, twoPerDay: false } });
    expect(r['running.longRunDay']).toBe(4);
    expect(r['lifestyle.allowTwoPerDay']).toBe(false);
  });

  it('the ramp caps a beginner\'s week-1 sessions and walking fills the target', () => {
    const w = buildTutorialWeek(input({ ramp: { level: 3, weekIndex: 0 } }));
    expect(w.sessionMinutes).toBe(20);
    expect(w.target).toBeGreaterThanOrEqual(75);
    expect(w.target).toBeLessThanOrEqual(90);
    expect(w.minutes.strength + w.minutes.run + w.minutes.walk).toBeGreaterThanOrEqual(w.target!);
    for (const d of w.days) if (d.strength) expect(d.strength.minutes).toBe(20);
    expect(buildTutorialWeek(input({ ramp: { level: 8, weekIndex: 0 } })).sessionMinutes).toBe(45);
    expect(buildTutorialWeek(input()).target).toBeNull();
  });
});
