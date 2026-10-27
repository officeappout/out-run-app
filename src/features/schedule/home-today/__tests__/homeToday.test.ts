import { describe, expect, it } from 'vitest';
import { resolveHomeToday, strengthLabelOn, type HomeTodayInput } from '../model/homeToday';
import { homeTourToday, optionalDoneOf, strengthMinutesOf } from '../model/homeTodayInputs';
import { DAY_LETTERS_HE as LETTERS } from '@/features/schedule/utils/strengthWeekRecommendation';

const base: HomeTodayInput = {
  todayDow: 0,
  dayOfMonth: 25,
  scheduleDays: ['א', 'ג', 'ה'],
  recurringTemplate: { 'א': ['FULL_BODY'], 'ג': ['FULL_BODY'], 'ה': ['FULL_BODY'] },
  trainingTime: '07:00',
  strengthDone: false,
  steps: 5200,
  stepsGoal: 8000,
};

describe('resolveHomeToday', () => {
  it('a strength day: workout + steps, flames out of 2, no optional card', () => {
    const m = resolveHomeToday(base);
    expect(m.strength).toEqual({ label: { kind: 'full_body', emphasis: 'push' }, time: '07:00', done: false, minutes: null, plannedMinutes: null });
    expect(m.optional).toBeNull();
    expect(m.steps).toEqual({ steps: 5200, goal: 8000, pct: 65, done: false });
    expect(m.flames).toEqual({ closed: 0, total: 2 });
    expect(m.next).toEqual({ dow: 2, time: '07:00' });
  });

  it('done workout and steps closed: 2 of 2, minutes kept', () => {
    const m = resolveHomeToday({ ...base, strengthDone: true, strengthMinutes: 32, steps: 9000 });
    expect(m.strength?.done).toBe(true);
    expect(m.strength?.minutes).toBe(32);
    expect(m.steps.pct).toBe(100);
    expect(m.flames).toEqual({ closed: 2, total: 2 });
  });

  it('a day without a workout: steps + core tabata, flames out of 1, next wraps the week', () => {
    const m = resolveHomeToday({ ...base, todayDow: 5 });
    expect(m.strength).toBeNull();
    expect(m.optional).toEqual({ kind: 'core_tabata', minutes: 8, done: false });
    expect(m.flames.total).toBe(1);
    expect(m.next).toEqual({ dow: 0, time: '07:00' });
  });

  it('full-body emphasis rotates through the week (push, pull, legs)', () => {
    expect(strengthLabelOn(base, 2)).toEqual({ kind: 'full_body', emphasis: 'pull' });
    expect(strengthLabelOn(base, 4)).toEqual({ kind: 'full_body', emphasis: 'legs' });
  });

  it('skill and legs days keep their own label; a bad time is dropped; no goal = empty ring', () => {
    const m = resolveHomeToday({ ...base, recurringTemplate: { 'א': ['PLANCHE', 'FULL_BODY'] }, trainingTime: 'soon', stepsGoal: 0 });
    expect(m.strength?.label).toEqual({ kind: 'skill', family: 'push', skill: 'PLANCHE' });
    expect(m.strength?.time).toBeNull();
    expect(m.steps.pct).toBe(0);
    expect(m.steps.done).toBe(false);
  });

  it('no schedule days: no next workout', () => {
    expect(resolveHomeToday({ ...base, scheduleDays: [] }).next).toBeNull();
  });
});

describe('inputs', () => {
  it('strength minutes from seconds, other kinds ignored', () => {
    expect(strengthMinutesOf([{ workoutType: 'strength', duration: 1900 }, { workoutType: 'running', duration: 1200 }])).toBe(32);
    expect(strengthMinutesOf(null)).toBe(0);
  });

  it('the tour view of today', () => {
    expect(homeTourToday(null)).toBeNull();
    expect(homeTourToday(resolveHomeToday({ ...base, todayDow: 1 }))).toEqual({ strengthToday: false, optionalMinutes: 8, next: { dow: 2, time: '07:00' } });
  });
});

describe('Part C: per-day time, planned minutes, short session done', () => {
  it("a day's own time wins over the one training time, also for the next day", () => {
    const own = resolveHomeToday({ ...base, timesByDay: { [LETTERS[base.todayDow]]: '06:30', [LETTERS[2]]: '20:15' } });
    expect(own.strength?.time).toBe('06:30');
    expect(own.next).toEqual({ dow: 2, time: '20:15' });
    expect(resolveHomeToday({ ...base, timesByDay: { [LETTERS[base.todayDow]]: 'bad' } }).strength?.time).toBe('07:00');
  });
  it('planned minutes ride on the strength card', () => {
    expect(resolveHomeToday({ ...base, plannedMinutes: 20 }).strength?.plannedMinutes).toBe(20);
  });
  it('optionalDoneOf: a strength / hybrid / recovery session today, not a run or walk', () => {
    expect(optionalDoneOf([{ workoutType: 'running' }, { category: 'walking' }])).toBe(false);
    expect(optionalDoneOf([{ workoutType: 'strength' }])).toBe(true);
    expect(optionalDoneOf([{ category: 'recovery' }])).toBe(true);
    expect(optionalDoneOf(null)).toBe(false);
  });
});
