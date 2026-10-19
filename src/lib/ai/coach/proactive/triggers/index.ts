import type { ProactiveTrigger, ProactiveUserState, TriggerDecision, TriggerOptions } from '../types';
import { assessmentTrigger } from './assessment';
import { morningTrigger } from './morning';
import { postWorkoutTrigger } from './post-workout';
import { weatherTrigger } from './weather';
import { weeklyTrigger } from './weekly';

export const TRIGGERS: Record<ProactiveTrigger, (s: ProactiveUserState, o?: TriggerOptions) => TriggerDecision> = {
  post_workout: postWorkoutTrigger,
  weather: weatherTrigger,
  morning: morningTrigger,
  weekly: weeklyTrigger,
  assessment: assessmentTrigger,
};
