import { describe, expect, it } from 'vitest';
import { isLegacyStrengthDone, todayWorkoutDoneUnderGate } from '../today-done-gate';
import { flameDayFromContext } from '../flame-day-input';
import { savedDayGoalsOf } from '../saved-day-goals';

// Written by the pre-flag rule: any strength session → workoutCompleted, no strengthGoalMet.
const legacy = { workoutCompleted: true, workoutType: 'strength' };

describe('isLegacyStrengthDone', () => {
  it('flags a strength workoutCompleted without strengthGoalMet', () => {
    expect(isLegacyStrengthDone(legacy)).toBe(true);
  });
  it('not legacy: gate field present, non-strength write, recovery, or not done', () => {
    expect(isLegacyStrengthDone({ ...legacy, strengthGoalMet: false })).toBe(false);
    expect(isLegacyStrengthDone({ ...legacy, strengthGoalMet: true })).toBe(false);
    expect(isLegacyStrengthDone({ workoutCompleted: true, workoutType: 'running' })).toBe(false);
    expect(isLegacyStrengthDone({ ...legacy, isRecovery: true })).toBe(false);
    expect(isLegacyStrengthDone({ workoutCompleted: false, workoutType: 'strength' })).toBe(false);
    expect(isLegacyStrengthDone(null)).toBe(false);
  });
});

describe('todayWorkoutDoneUnderGate', () => {
  const base = { flameTiers: true, saved: legacy, loggedSets: 3, targetSets: 12 };

  it('flag off → the saved workoutCompleted, unchanged', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, flameTiers: false })).toBe(true);
    expect(todayWorkoutDoneUnderGate({ ...base, flameTiers: false, saved: { workoutCompleted: false } })).toBe(false);
  });
  it('legacy today below the bar (3 of 12, bar 8) → not done', () => {
    expect(todayWorkoutDoneUnderGate(base)).toBe(false);
  });
  it('legacy today at the bar from logged sets → done', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, loggedSets: 8 })).toBe(true);
  });
  it('legacy rest day: needs ≥ 4 sets', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, targetSets: 0, loggedSets: 3 })).toBe(false);
    expect(todayWorkoutDoneUnderGate({ ...base, targetSets: 0, loggedSets: 4 })).toBe(true);
  });
  it('legacy doc that saved its set count counts it (other device)', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, loggedSets: 0, saved: { ...legacy, dailyStrengthCompletedSets: 9 } })).toBe(true);
  });
  it('a run / walk also done today keeps the day done', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, nonStrengthDoneToday: true })).toBe(true);
  });
  it('new-gate docs and non-strength writes are trusted', () => {
    expect(todayWorkoutDoneUnderGate({ ...base, saved: { ...legacy, strengthGoalMet: true } })).toBe(true);
    expect(todayWorkoutDoneUnderGate({ ...base, saved: { workoutCompleted: true, workoutType: 'running' } })).toBe(true);
    expect(todayWorkoutDoneUnderGate({ ...base, saved: { workoutCompleted: false } })).toBe(false);
  });
});

describe('flameDayFromContext — legacy today vs past', () => {
  const ctx = {
    activity: null, // not on the device → qualifiesSaved decides
    loggedSets: 3,
    weeklyTarget: 36,
    scheduleDays: 3, // daily target 12 → bar 8
    isTrainingDay: true,
    saved: savedDayGoalsOf(legacy),
  };
  it('savedDayGoalsOf marks the legacy write', () => {
    expect(savedDayGoalsOf(legacy)?.legacyStrengthDone).toBe(true);
    expect(savedDayGoalsOf({ ...legacy, strengthGoalMet: true })?.legacyStrengthDone).toBeUndefined();
  });
  it('TODAY below the bar → no flame, only the started mark', () => {
    expect(flameDayFromContext({ ...ctx, isToday: true })).toMatchObject({ level: 0, started: true, strengthMet: false });
  });
  it('TODAY at the bar → strength goal flame', () => {
    expect(flameDayFromContext({ ...ctx, isToday: true, loggedSets: 8 })).toMatchObject({ level: 2, strengthMet: true });
  });
  it('a PAST day keeps its saved fields', () => {
    expect(flameDayFromContext({ ...ctx, isToday: false })).toMatchObject({ level: 1 });
  });
});
