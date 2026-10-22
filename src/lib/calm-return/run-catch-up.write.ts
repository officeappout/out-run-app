/**
 * The one write of the running catch-up (enable_week_builder_v1): the plan moves so the target
 * week begins today (buildFreshWeekRunningProgram, the calm-return move), plus a small marker
 * so the same gap / plan week is never judged twice, and — from the "חוזרים לרוץ" drawer — the
 * optional race date. Owner-writable `running.*` fields only (as calm-return.write.ts).
 *
 *   running.catchUp?:  { appliedOn: 'YYYY-MM-DD'; reason: CatchUpReason; targetWeek: number; v: 1 }
 *   running.raceGoal?: { date: 'YYYY-MM-DD'; v: 1 }                         (run-race.ts)
 */
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { localDayKey } from './days-away';
import type { CatchUpReason } from './run-catch-up';
import type { RaceGoal } from './run-race';
import { buildFreshWeekRunningProgram, type FreshWeekScheduleEntry } from './running';

export interface CatchUpMarker {
  appliedOn: string;
  reason: CatchUpReason;
  targetWeek: number;
  v: 1;
}

export async function applyRunCatchUp(input: {
  uid: string;
  program: { startDate: unknown; currentWeek?: number; schedule: FreshWeekScheduleEntry[] };
  targetWeek: number;
  reason: CatchUpReason;
  now: Date;
  raceGoal?: RaceGoal | null;
}): Promise<boolean> {
  const { uid, program, targetWeek, reason, now } = input;
  if (!program.schedule?.length) return false;
  const fresh = buildFreshWeekRunningProgram(program, now, targetWeek);
  const marker: CatchUpMarker = { appliedOn: localDayKey(now), reason, targetWeek: fresh.resumeWeek, v: 1 };
  const update: Record<string, unknown> = {
    'running.activeProgram.startDate': fresh.startDate,
    'running.activeProgram.currentWeek': fresh.currentWeek,
    'running.activeProgram.schedule': fresh.schedule,
    'running.catchUp': marker,
    updatedAt: serverTimestamp(),
  };
  if (input.raceGoal) update['running.raceGoal'] = input.raceGoal;
  try {
    await updateDoc(doc(db, 'users', uid), update);
    return true;
  } catch (err) {
    console.warn('[RunCatchUp] could not apply (non-blocking):', err);
    return false;
  }
}
