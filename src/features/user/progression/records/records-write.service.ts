/**
 * enable_home_v2 — writes the workout aggregates (period totals + broken
 * records) onto users/{uid} in ONE updateDoc, right after the existing
 * workoutCount increment in completion-sync. Forward-only, best-effort:
 * a failure is logged and never blocks the completion flow.
 * Owner-writable progression keys (firestore.rules Group C only guards
 * globalLevel/globalXP/coins) — no rules or Cloud Function change.
 */
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  applyPeriodIncrements,
  applyRecordUpdates,
  periodTotalsIncrements,
  recordUpdates,
  type WorkoutForAggregates,
} from './records.utils';

export async function writeWorkoutAggregates(uid: string, w: WorkoutForAggregates, now = new Date()): Promise<void> {
  const progression = useUserStore.getState().profile?.progression;
  const increments = periodTotalsIncrements(w, now);
  const records = recordUpdates(progression?.records, w, now.getTime());

  const payload: Record<string, unknown> = { ...records };
  for (const [path, n] of Object.entries(increments)) payload[path] = increment(n);

  try {
    await updateDoc(doc(db, 'users', uid), payload);
    // Keep the local profile in step so the next comparison isn't stale.
    const p = useUserStore.getState().profile;
    if (p?.progression) {
      useUserStore.getState().updateProfile({
        progression: {
          ...p.progression,
          records: applyRecordUpdates(p.progression.records, records),
          periodTotals: applyPeriodIncrements(p.progression.periodTotals, increments),
        },
      });
    }
  } catch (err) {
    console.warn('[records] workout aggregates write failed:', err);
  }
}
