import { describe, expect, it } from 'vitest';
import { aerobicGoalMet, flameLevelForDay } from '../flame-level';
import { dailyTargetFor, flameDayFromContext } from '../flame-day-input';
import { savedDayGoalsOf } from '../saved-day-goals';

const day = (o: { strength?: number; cardio?: number; cardioGoal?: number; steps?: number; stepsGoal?: number; sessions?: number } = {}) => ({
  categories: {
    strength: { minutes: o.strength ?? 0, sessions: o.sessions ?? 0 },
    cardio: { minutes: o.cardio ?? 0, goalMinutes: o.cardioGoal ?? 30 },
    maintenance: { minutes: 0 },
  },
  steps: o.steps ?? 0,
  stepsGoal: o.stepsGoal ?? 8000,
});

describe('flameLevelForDay', () => {
  it('nothing → 0, no mark', () => {
    expect(flameLevelForDay({ activity: null, strengthSets: 0, strengthTargetSets: 12 })).toEqual({
      level: 0, started: false, strengthMet: false, aerobicMet: false, stepsOnly: false,
    });
  });
  it('a short workout below every bar → 0 + the "started" mark', () => {
    const r = flameLevelForDay({ activity: day({ strength: 5, sessions: 1 }), strengthSets: 2, strengthTargetSets: 12 });
    expect(r).toMatchObject({ level: 0, started: true });
  });
  it('streak day with a workout, no domain goal → 1 (program colour)', () => {
    expect(flameLevelForDay({ activity: day({ strength: 14 }), strengthSets: 3, strengthTargetSets: 12 })).toMatchObject({ level: 1, stepsOnly: false });
  });
  it('steps-only day (step goal, no workout) → 1, steps flame', () => {
    expect(flameLevelForDay({ activity: day({ steps: 9000 }), strengthSets: 0, strengthTargetSets: 12 })).toMatchObject({
      level: 1, started: false, stepsOnly: true,
    });
  });
  it('passive minutes: count for the streak, not for the aerobic goal', () => {
    const r = flameLevelForDay({ activity: day({ cardio: 45 }), strengthSets: 0, strengthTargetSets: 0, aerobicMinutes: 0 });
    expect(r).toMatchObject({ level: 1, aerobicMet: false, stepsOnly: true });
  });
  it('strength goal met (local sets) → 2', () => {
    expect(flameLevelForDay({ activity: day({ strength: 35 }), strengthSets: 8, strengthTargetSets: 12 })).toMatchObject({ level: 2, strengthMet: true });
  });
  it('strength goal saved on the server (other device) → 2 without local sets', () => {
    expect(flameLevelForDay({ activity: day({ strength: 35 }), strengthSets: 0, strengthTargetSets: 12, strengthGoalSaved: true })).toMatchObject({ level: 2, strengthMet: true });
  });
  it('aerobic-only day: recorded run / walk minutes ≥ goal → 2; a planned run done → 2', () => {
    expect(flameLevelForDay({ activity: day({ cardio: 32 }), strengthSets: 0, strengthTargetSets: 0, aerobicMinutes: 32 })).toMatchObject({ level: 2, aerobicMet: true });
    expect(flameLevelForDay({ activity: day({ cardio: 18 }), strengthSets: 0, strengthTargetSets: 0, aerobicMinutes: 18, aerobicPlanDone: true }).level).toBe(2);
    expect(flameLevelForDay({ activity: day({ cardio: 18 }), strengthSets: 0, strengthTargetSets: 0, aerobicMinutes: 18 }).level).toBe(1);
  });
  it('both goals → 3 (big)', () => {
    expect(flameLevelForDay({ activity: day({ strength: 30, cardio: 30 }), strengthSets: 9, strengthTargetSets: 12, aerobicMinutes: 30 }).level).toBe(3);
  });
  it('rest day / no program (target 0): 4 sets meet strength, 3 do not', () => {
    expect(flameLevelForDay({ activity: day({ strength: 15 }), strengthSets: 4, strengthTargetSets: 0 }).level).toBe(2);
    expect(flameLevelForDay({ activity: day({ strength: 15 }), strengthSets: 3, strengthTargetSets: 0 }).level).toBe(1);
  });
  it('goals without a streak day stay at 0 (the streak rule is the floor)', () => {
    expect(flameLevelForDay({ activity: day({ strength: 6 }), strengthSets: 4, strengthTargetSets: 0 })).toMatchObject({ level: 0, started: true });
  });
  it('a day not on the device (old month cell) qualifies from the saved day', () => {
    expect(flameLevelForDay({ activity: null, strengthSets: 0, strengthTargetSets: 12, qualifiesSaved: true, strengthGoalSaved: true }).level).toBe(2);
    expect(flameLevelForDay({ activity: null, strengthSets: 0, strengthTargetSets: 12, qualifiesSaved: false }).level).toBe(0);
  });
  it('aerobic goal: falls back to 30 min, 0 minutes never meets', () => {
    expect(aerobicGoalMet(30, null)).toBe(true);
    expect(aerobicGoalMet(20, { categories: { cardio: { minutes: 0, goalMinutes: 20 } } })).toBe(true);
    expect(aerobicGoalMet(0, { categories: { cardio: { minutes: 0, goalMinutes: 0 } } })).toBe(false);
    expect(aerobicGoalMet(0, null, true)).toBe(true);
  });
});

describe('flameDayFromContext', () => {
  const base = { activity: null, isToday: true, loggedSets: 0, weeklyTarget: 36, scheduleDays: 3, isTrainingDay: true };
  it('daily target = weekly ÷ days, 0 on a rest day', () => {
    expect(dailyTargetFor(36, 3, true)).toBe(12);
    expect(dailyTargetFor(36, 0, true)).toBe(36);
    expect(dailyTargetFor(36, 3, false)).toBe(0);
  });
  it('adds the pending session to today (summary before Finish)', () => {
    expect(flameDayFromContext(base).level).toBe(0);
    expect(flameDayFromContext({ ...base, pending: { strengthMinutes: 25, strengthSets: 8 } })).toMatchObject({ level: 2, strengthMet: true });
    expect(flameDayFromContext({ ...base, pending: { strengthMinutes: 6, strengthSets: 2 } })).toMatchObject({ level: 0, started: true });
  });
  it('local session logs count for today only; past days use the saved day', () => {
    const today = flameDayFromContext({ ...base, activity: day({ strength: 30 }), loggedSets: 5, pending: { strengthSets: 3 } });
    expect(today.strengthMet).toBe(true);
    const past = flameDayFromContext({ ...base, isToday: false, activity: day({ strength: 30 }), loggedSets: 12 });
    expect(past.strengthMet).toBe(false);
    const pastSaved = flameDayFromContext({ ...base, isToday: false, activity: day({ strength: 30 }), saved: { strengthGoalMet: true } });
    expect(pastSaved.level).toBe(2);
  });
  it('saved aerobic minutes feed the aerobic goal', () => {
    const r = flameDayFromContext({ ...base, isToday: false, activity: day({ cardio: 40 }), saved: { aerobicWorkoutMinutes: 35, strengthGoalMet: true } });
    expect(r.level).toBe(3);
  });
  it('savedDayGoalsOf keeps only the known fields', () => {
    expect(savedDayGoalsOf({ strengthGoalMet: false, aerobicWorkoutMinutes: 12, workoutCompleted: true, stepGoalMet: false, x: 1 })).toEqual({
      strengthGoalMet: false, aerobicWorkoutMinutes: 12, workoutCompleted: true,
    });
    expect(savedDayGoalsOf(null)).toBeNull();
  });
});
