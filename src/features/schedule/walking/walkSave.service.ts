/**
 * Walking plan — the write (enable_home_v2). Firestore glue only; the decisions are
 * pure (walkSchedule.ts).
 *
 *  1. one batched read of the horizon's day docs (getScheduleEntriesForDates);
 *  2. a template weekday that has no day doc yet is hydrated first (the app's own
 *     transactional hydrateFromTemplate) — the agenda only hydrates EMPTY days, so a
 *     walk written alone would hide that day's strength workout;
 *  3. one writeBatch: each changed day = its other entries + the new walk
 *     (this flow's old walks replaced, see planWalkDayWrites);
 *  4. a walking-only user (no strength / running track) with no primaryTrack yet
 *     gets primaryTrack 'health' — an existing value: dashboardMode DEFAULT, the
 *     health metrics (steps) first. Nothing else on the profile changes.
 */
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  getScheduleEntriesForDates,
  hydrateFromTemplate,
} from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate, UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import type { TimeWindow } from '../engine-v2/types';
import type { WalkPlan } from './walkPlan.types';
import { buildWalkEntries, datesNeedingHydration, planWalkDayWrites, walkHorizon } from './walkSchedule';

const COLLECTION = 'userSchedule';

function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export interface SaveWalkPlanInput {
  plan: WalkPlan;
  windows: Partial<Record<number, TimeWindow>>;
  recurringTemplate?: RecurringTemplate | null;
  reminders?: { runningTime?: string; strengthTime?: string };
  /** Set primaryTrack 'health' (walking-only user without one). */
  setHealthTrack: boolean;
  now?: Date;
}

export async function saveWalkPlan(input: SaveWalkPlanInput): Promise<{ written: number }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  const now = input.now ?? new Date();

  const horizon = walkHorizon(now, input.plan.weeks.length).map((d) => d.date);
  const walks = buildWalkEntries(input.plan, input.windows, now, uid);

  const existing = await getScheduleEntriesForDates(uid, horizon);
  // A failed read must not be mistaken for empty days (it would drop real entries).
  if (!existing) throw new Error('schedule read failed');
  const byDate: Record<string, UserScheduleEntry[]> = { ...existing };

  const template = input.recurringTemplate ?? null;
  if (template) {
    const letters = new Set(Object.keys(template).filter((k) => Array.isArray(template[k as keyof RecurringTemplate])));
    const toHydrate = datesNeedingHydration(byDate, walks, letters);
    const hydrated = await Promise.all(toHydrate.map((d) => hydrateFromTemplate(uid, d, template, input.reminders)));
    toHydrate.forEach((d, i) => {
      if (hydrated[i].length) byDate[d] = hydrated[i];
    });
  }

  const writes = planWalkDayWrites(byDate, walks, horizon);
  if (writes.length) {
    const batch = writeBatch(db);
    for (const w of writes) {
      batch.set(
        doc(db, COLLECTION, `${uid}_${w.date}`),
        { userId: uid, date: w.date, entries: w.entries.map((e) => clean(e)), updatedAt: serverTimestamp() },
        { merge: false },
      );
    }
    await batch.commit();
  }

  if (input.setHealthTrack) {
    try {
      await updateDoc(doc(db, 'users', uid), { 'lifestyle.primaryTrack': 'health', updatedAt: serverTimestamp() });
    } catch (err) {
      console.error('[walkSave] primaryTrack write failed (non-fatal)', err);
    }
  }
  return { written: writes.length };
}
