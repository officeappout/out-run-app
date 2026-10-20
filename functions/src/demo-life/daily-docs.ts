/**
 * Demo world — a persona's day docs (pure): dailyActivity/{uid}_{date} (the app's
 * DailyActivity shape) and its public steps mirror dailyActivityPublic/{uid}_{date}
 * (ageGroup 'demo' — no real board's age query can return it). Shared by the seed
 * (scripts/demo/lib/history.ts) and the live engine (demoSimulatorTick).
 */
import type { LifeCat, LifeDoc } from './session-docs';

/**
 * The app's default goals (src/features/activity/types/activity.types.ts
 * DEFAULT_DAILY_GOALS / DEFAULT_WEEKLY_GOALS), mirrored because functions/ cannot import
 * src/. A parity test (scripts/demo/__tests__) keeps them equal.
 */
export const DAILY_GOALS_MIRROR: Record<LifeCat, number> = { strength: 30, cardio: 30, maintenance: 15 };
export const WEEKLY_GOALS_MIRROR: Record<LifeCat, number> = { strength: 150, cardio: 150, maintenance: 60 };

export const LIFE_CATS: LifeCat[] = ['strength', 'cardio', 'maintenance'];

function categoryMetrics(minutes: number, goal: number, weekly: number, weeklyGoal: number, sessions: number) {
  return {
    minutes,
    goalMinutes: goal,
    weeklyMinutes: weekly,
    weeklyGoalMinutes: weeklyGoal,
    percentage: Math.min(100, Math.round((minutes / goal) * 100)),
    isGoalMet: minutes >= goal,
    sessions,
  };
}

export interface DayActivityInput {
  uid: string;
  date: string;
  displayName: string;
  authorityId: string;
  neighborhoodId: string | null;
  /** Minutes per category done that day. */
  dayMin: Record<LifeCat, number>;
  /** Minutes per category this week up to and including that day. */
  weekly: Record<LifeCat, number>;
  daySessions: Record<LifeCat, number>;
  steps: number;
  stepGoal: number;
  floors: number;
  calories: number;
  distanceMeters: number;
  streak: number;
  updatedAt: Date;
}

/** A day "counts" for the streak: ≥ 10 minutes of training, or 70 % of the step goal. */
export function dayQualifies(dayMin: Record<LifeCat, number>, steps: number, stepGoal: number): boolean {
  return dayMin.strength + dayMin.cardio + dayMin.maintenance >= 10 || steps >= stepGoal * 0.7;
}

export function dailyActivityDoc(d: DayActivityInput): LifeDoc {
  const anyWorkout = d.dayMin.strength + d.dayMin.cardio + d.dayMin.maintenance >= 10;
  const dominant = LIFE_CATS.reduce<LifeCat | null>((best, k) => (d.dayMin[k] > 0 && (!best || d.dayMin[k] > d.dayMin[best]) ? k : best), null);
  return {
    path: `dailyActivity/${d.uid}_${d.date}`,
    data: {
      date: d.date,
      userId: d.uid,
      categories: {
        strength: categoryMetrics(d.dayMin.strength, DAILY_GOALS_MIRROR.strength, d.weekly.strength, WEEKLY_GOALS_MIRROR.strength, d.daySessions.strength),
        cardio: categoryMetrics(d.dayMin.cardio, DAILY_GOALS_MIRROR.cardio, d.weekly.cardio, WEEKLY_GOALS_MIRROR.cardio, d.daySessions.cardio),
        maintenance: categoryMetrics(d.dayMin.maintenance, DAILY_GOALS_MIRROR.maintenance, d.weekly.maintenance, WEEKLY_GOALS_MIRROR.maintenance, d.daySessions.maintenance),
      },
      steps: d.steps,
      stepsGoal: d.stepGoal,
      stepsGoalMet: d.steps >= d.stepGoal,
      floors: d.floors,
      floorsGoal: 10,
      floorsGoalMet: false,
      calories: d.calories,
      distanceMeters: d.distanceMeters,
      activityType: anyWorkout ? 'super' : d.steps >= d.stepGoal ? 'micro' : 'none',
      streak: d.streak,
      dominantCategory: dominant,
      authorityId: d.authorityId,
      ...(d.neighborhoodId ? { neighborhoodId: d.neighborhoodId } : {}),
      displayName: d.displayName,
      isDemo: true,
      updatedAt: d.updatedAt,
    },
  };
}

export function dailyActivityPublicDoc(d: { uid: string; date: string; displayName: string; steps: number; authorityId: string; updatedAt: Date }): LifeDoc {
  return {
    path: `dailyActivityPublic/${d.uid}_${d.date}`,
    data: { uid: d.uid, displayName: d.displayName, steps: d.steps, authorityId: d.authorityId, date: d.date, ageGroup: 'demo', isDemo: true, updatedAt: d.updatedAt },
  };
}
