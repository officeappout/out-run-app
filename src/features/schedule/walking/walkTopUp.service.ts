/**
 * Weekly top-up — the write (enable_home_v2). Firestore glue only; the decisions are
 * pure (walkTopUp.ts). One bounded batched read (6 weeks of day docs,
 * getScheduleEntriesForDates), template-day hydration for new walk dates without a
 * day doc (the same step the signup save runs), then one writeBatch that only ADDS
 * walks to dates without this flow's walk. Throws on a failed read (never treats it
 * as empty days); the caller swallows.
 */
import { auth } from '@/lib/firebase';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate, UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { planTopUpDayWrites, planWalkTopUp, topUpReadDates } from './walkTopUp';
import { commitWalkDayWrites, hydrateWalkDays } from './walkSave.service';

export interface WalkTopUpServiceInput {
  stepGoal: number | null;
  recurringTemplate?: RecurringTemplate | null;
  reminders?: { runningTime?: string; strengthTime?: string };
  now?: Date;
}

export async function topUpWalkPlan(input: WalkTopUpServiceInput): Promise<{ written: number }> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { written: 0 };
  const now = input.now ?? new Date();
  const existing = await getScheduleEntriesForDates(uid, topUpReadDates(now));
  if (!existing) throw new Error('schedule read failed');
  const byDate: Record<string, UserScheduleEntry[]> = { ...existing };

  const walks = planWalkTopUp({ byDate, today: now, uid, stepGoal: input.stepGoal });
  if (!walks) return { written: 0 };

  await hydrateWalkDays(uid, byDate, walks, input.recurringTemplate ?? null, input.reminders);
  const writes = planTopUpDayWrites(byDate, walks);
  await commitWalkDayWrites(uid, writes);
  return { written: writes.length };
}
