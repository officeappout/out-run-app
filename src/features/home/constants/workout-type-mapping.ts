/**
 * workout-type-mapping — the PURE type→category contract behind
 * AddWorkoutModal's TYPE_OPTIONS (extracted for unit-testing, stability
 * Phase 1, 08.07.2026).
 *
 * This mapping defines what `upsertScheduleEntry` receives in
 * `scheduledCategories` and what the activity rings log — the schema
 * contract for entry point B. The hybrid type will be ADDED here (Phase 2)
 * rather than inventing a parallel mapping.
 */
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import type { ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';

export type BuilderWorkoutType = 'strength' | 'running' | 'walking';

export interface WorkoutTypeMapping {
  activityCategory: ActivityCategory;
  scheduleCategory: ScheduleActivityCategory;
  /** activityType stamped on presence/session starts from this entry. */
  activityType: 'workout' | 'running';
}

export const WORKOUT_TYPE_MAPPING: Record<BuilderWorkoutType, WorkoutTypeMapping> = {
  strength: { activityCategory: 'strength', scheduleCategory: 'strength', activityType: 'workout' },
  running:  { activityCategory: 'cardio',   scheduleCategory: 'cardio',   activityType: 'running' },
  walking:  { activityCategory: 'cardio',   scheduleCategory: 'walking',  activityType: 'workout' },
};
