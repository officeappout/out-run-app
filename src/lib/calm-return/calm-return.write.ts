/**
 * The one write calm return makes: on the first app open after a 7+ day gap it stores the
 * new return episode (users/{uid}.calmReturn) and — when the user has a running program —
 * silently moves that program to a fresh week starting today (buildFreshWeekRunningProgram),
 * in ONE updateDoc so the two never disagree. Replaces the realign/rebuild popups.
 *
 * Owner-writable fields only (calmReturn is new and unprotected; running.activeProgram is
 * already written by the client in workout-completion.service.ts).
 */
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CalmReturnEpisode } from './policy';
import { buildFreshWeekRunningProgram, type FreshWeekScheduleEntry } from './running';

export async function startCalmReturnEpisode(input: {
  uid: string;
  episode: CalmReturnEpisode;
  runningProgram?: { startDate: unknown; currentWeek?: number; schedule: FreshWeekScheduleEntry[] } | null;
  now: Date;
}): Promise<boolean> {
  const { uid, episode, runningProgram, now } = input;
  const update: Record<string, unknown> = {
    calmReturn: episode,
    updatedAt: serverTimestamp(),
  };
  if (runningProgram?.schedule?.length) {
    const fresh = buildFreshWeekRunningProgram(runningProgram, now);
    update['running.activeProgram.startDate'] = fresh.startDate;
    update['running.activeProgram.currentWeek'] = fresh.currentWeek;
    update['running.activeProgram.schedule'] = fresh.schedule;
  }
  try {
    await updateDoc(doc(db, 'users', uid), update);
    return true;
  } catch (err) {
    console.warn('[CalmReturn] could not start the return episode (non-blocking):', err);
    return false;
  }
}
