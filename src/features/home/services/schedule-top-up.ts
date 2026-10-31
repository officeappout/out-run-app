/**
 * "Schedule for 20:00" on the evening top-up card (board HomeAfterTopUp): adds a strength
 * entry to today's schedule at TOP_UP_SCHEDULE_TIME. Best-effort: never throws.
 */
import { addScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';
import { TOP_UP_SCHEDULE_TIME } from '@/features/workout-engine/core/generators/partial-completion-plan';

export async function scheduleTopUpTonight(uid: string, title: string, now: Date = new Date()): Promise<boolean> {
  const date = toISODate(now);
  try {
    await addScheduleEntry(uid, date, {
      userId: uid,
      date,
      programIds: [],
      type: 'training',
      source: 'manual',
      completed: false,
      title,
      startTime: TOP_UP_SCHEDULE_TIME,
      scheduledCategories: ['strength'],
    });
    return true;
  } catch (err) {
    console.warn('[scheduleTopUpTonight] failed (non-fatal)', err);
    return false;
  }
}
