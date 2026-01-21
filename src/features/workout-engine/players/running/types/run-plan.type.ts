// src/features/run/types/run-plan.type.ts

import RunWorkout from './run-workout.type';

export type RunPlanWeek = {
  weekNumber: number;
  workouts: RunWorkout[];
};

export type RunPlan = {
  id: string;
  name: string;
  targetDistance: '3k' | '5k' | '10k' | 'maintenance'; 
  durationWeeks: number;
  weeks: RunPlanWeek[];
};

export default RunPlan;