import { describe, expect, it } from 'vitest';
import { recommendStrengthWeek } from '@/features/schedule/utils/strengthWeekRecommendation';
import { EMPTY_REMINDER_PLAN, runningReminderPlan, strengthReminderPlan } from '../wizard-reminder-plan';

describe('wizard reminder plan', () => {
  it('strength: from the confirmed week', () => {
    const week = recommendStrengthWeek({
      seed: { programs: ['FULL_BODY'], skills: [] },
      frequency: 3,
      days: [0, 2, 4],
      level: 'beginner',
    });
    expect(strengthReminderPlan(week)).toEqual({
      subtitle: '3 אימוני כוח בשבוע · א׳ ג׳ ה׳ ערב',
      sampleWorkoutName: 'כל הגוף',
      sampleTime: '19:00',
      sessions: [
        { dow: 0, time: '19:00' },
        { dow: 2, time: '19:00' },
        { dow: 4, time: '19:00' },
      ],
    });
  });

  it('strength: an empty week falls back to the neutral plan', () => {
    expect(strengthReminderPlan({ days: [], warningsHe: [], recoveryHours: 48 })).toBe(EMPTY_REMINDER_PLAN);
  });

  it('running: the running step\'s days + time', () => {
    expect(runningReminderPlan({ runningScheduleDayIndices: [5, 1, 3, 3], runningScheduleTime: '06:30' })).toEqual({
      subtitle: '3 ריצות בשבוע · ב׳ ד׳ ו׳',
      sampleWorkoutName: 'ריצה',
      sampleTime: '06:30',
      sessions: [
        { dow: 1, time: '06:30' },
        { dow: 3, time: '06:30' },
        { dow: 5, time: '06:30' },
      ],
    });
  });

  it('running: bad data never throws', () => {
    expect(runningReminderPlan({ runningScheduleDayIndices: ['x', 9] })).toBe(EMPTY_REMINDER_PLAN);
    expect(runningReminderPlan({ runningScheduleDayIndices: [2], runningScheduleTime: 'soon' }).sampleTime).toBe('07:00');
  });
});
