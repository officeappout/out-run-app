import { describe, it, expect } from 'vitest';
import { WORKOUT_TYPE_MAPPING } from '../workout-type-mapping';

/**
 * Schema contract for entry point B (AddWorkoutModal → upsertScheduleEntry):
 * scheduledCategories and the activity-rings category derive from this
 * mapping. Changing a value here changes what lands in Firestore
 * userSchedule docs — this test makes that a deliberate act.
 */
describe('WORKOUT_TYPE_MAPPING — schedule schema contract', () => {
  it('strength → strength/strength/workout', () => {
    expect(WORKOUT_TYPE_MAPPING.strength).toEqual({
      activityCategory: 'strength', scheduleCategory: 'strength', activityType: 'workout',
    });
  });
  it('running → cardio/cardio/running', () => {
    expect(WORKOUT_TYPE_MAPPING.running).toEqual({
      activityCategory: 'cardio', scheduleCategory: 'cardio', activityType: 'running',
    });
  });
  it('walking → cardio/walking/workout (walking is a FIRST-CLASS schedule category)', () => {
    expect(WORKOUT_TYPE_MAPPING.walking).toEqual({
      activityCategory: 'cardio', scheduleCategory: 'walking', activityType: 'workout',
    });
  });
});
