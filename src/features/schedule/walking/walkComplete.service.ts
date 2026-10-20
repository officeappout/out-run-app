/**
 * Mark the planned walk a just-saved walk came from as completed (enable_home_v2).
 * Firestore glue only: one day read + the existing replace-by-entryId write
 * (addScheduleEntry). The decision is pure (walkComplete.ts); the marker is
 * sessionStorage (walkHandoff.ts), written only by the v2 walk start actions — no
 * marker → nothing happens. Best-effort: never throws.
 */
import { addScheduleEntry, getScheduleEntries } from '@/features/user/scheduling/services/userSchedule.service';
import { consumePendingWalkEntry } from './walkHandoff';
import { completedWalkEntry } from './walkComplete';

export async function completePendingPlannedWalk(uid: string, workoutId: string | null): Promise<boolean> {
  const pending = consumePendingWalkEntry();
  if (!pending) return false;
  try {
    const entries = await getScheduleEntries(uid, pending.date);
    const next = completedWalkEntry(entries, pending.entryId, workoutId);
    if (!next) return false;
    await addScheduleEntry(uid, pending.date, next);
    return true;
  } catch (err) {
    console.warn('[walkComplete] marking the planned walk done failed (non-fatal)', err);
    return false;
  }
}
