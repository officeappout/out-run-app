/**
 * The one write for run moves (enable_week_builder_v1): users/{uid}.running.runMoves — an
 * OPTIONAL additive field on the owner-writable running profile (see utils/runWeekMoves.ts for
 * the shape). Ended weeks are pruned on every write.
 */
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { mergeRunMoves, type RunDateMove } from '../../utils/runWeekMoves';

export async function saveRunMoves(uid: string, existing: unknown, next: readonly RunDateMove[], todayKey: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      'running.runMoves': mergeRunMoves(existing, next, todayKey),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn('[Planner] could not save the run move (non-blocking):', err);
    return false;
  }
}
