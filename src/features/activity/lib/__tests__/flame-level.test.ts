import { describe, expect, it } from 'vitest';
import { aerobicGoalMet, flameLevelForDay } from '../flame-level';
import { dailyTargetFor, flameDayFromContext } from '../flame-day-input';

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
      level: 0, started: false, strengthMet: false, aerobicMet: false,
    });
  });
  it('a short workout below every bar → 0 + the "started" mark', () => {
    const r = flameLevelForDay({ activity: day({ strength: 5, sessions: 1 }), strengthSets: 2, strengthTargetSets: 12 });
    expect(r.level).toBe(0);
    expect(r.started).toBe(true);
  });
  it('streak day, no domain goal → 1 (small)', () => {
    expect(flameLevelForDay({ activity: day({ strength: 14 }), strengthSets: 3, strengthTargetSets: 12 }).level).toBe(1);
  });
  it('steps-only day (step goal, no workout) → 1', () => {
    const r = flameLevelForDay({ activity: day({ steps: 9000 }), strengthSets: 0, strengthTargetSets: 12 });
    expect(r.level).toBe(1);
    expect(r.started).toBe(false);
  });
  it('strength goal met → 2', () => {
    const r = flameLevelForDay({ activity: day({ strength: 35 }), strengthSets: 8, strengthTargetSets: 12 });
    expect(r).toMatchObject({ level: 2, strengthMet: true, aerobicMet: false });
  });
  it('aerobic-only day (cardio goal) → 2', () => {
    const r = flameLevelForDay({ activity: day({ cardio: 32 }), strengthSets: 0, strengthTargetSets: 0 });
    expect(r).toMatchObject({ level: 2, strengthMet: false, aerobicMet: true });
  });
  it('both goals → 3 (big)', () => {
    expect(flameLevelForDay({ activity: day({ strength: 30, cardio: 30 }), strengthSets: 9, strengthTargetSets: 12 }).level).toBe(3);
  });
  it('rest day / no program (target 0): 4 sets meet strength, 3 do not', () => {
    expect(flameLevelForDay({ activity: day({ strength: 15 }), strengthSets: 4, strengthTargetSets: 0 }).level).toBe(2);
    expect(flameLevelForDay({ activity: day({ strength: 15 }), strengthSets: 3, strengthTargetSets: 0 }).level).toBe(1);
  });
  it('goals without a streak day stay at 0 (the streak rule is the floor)', () => {
    const r = flameLevelForDay({ activity: day({ strength: 6 }), strengthSets: 4, strengthTargetSets: 0 });
    expect(r.level).toBe(0);
    expect(r.started).toBe(true);
  });
  it('aerobic goal: falls back to 30 min, 0 minutes never meets', () => {
    expect(aerobicGoalMet({ categories: { cardio: { minutes: 30 } } })).toBe(true);
    expect(aerobicGoalMet({ categories: { cardio: { minutes: 20, goalMinutes: 20 } } })).toBe(true);
    expect(aerobicGoalMet({ categories: { cardio: { minutes: 0, goalMinutes: 0 } } })).toBe(false);
    expect(aerobicGoalMet(null)).toBe(false);
  });
});

describe('flameDayFromContext', () => {
  it('daily target = weekly ÷ days, 0 on a rest day', () => {
    expect(dailyTargetFor(36, 3, true)).toBe(12);
    expect(dailyTargetFor(36, 0, true)).toBe(36);
    expect(dailyTargetFor(36, 3, false)).toBe(0);
  });
  it('adds the pending session to today (summary before Finish)', () => {
    const base = { activity: null, loggedSets: 0, weeklyTarget: 36, scheduleDays: 3, isTrainingDay: true };
    expect(flameDayFromContext(base).level).toBe(0);
    expect(flameDayFromContext({ ...base, pending: { strengthMinutes: 25, strengthSets: 8 } })).toMatchObject({ level: 2, strengthMet: true });
    // 2 sets in 6 minutes: started, no flame
    expect(flameDayFromContext({ ...base, pending: { strengthMinutes: 6, strengthSets: 2 } })).toMatchObject({ level: 0, started: true });
  });
  it('prior logged sets count toward the bar', () => {
    const r = flameDayFromContext({
      activity: day({ strength: 30 }), loggedSets: 5, weeklyTarget: 36, scheduleDays: 3, isTrainingDay: true,
      pending: { strengthSets: 3 },
    });
    expect(r.strengthMet).toBe(true);
  });
});
