/**
 * Step goal service — client glue around lib/step-goal.ts (the ONE resolver).
 *
 *   refreshStepGoal(uid)        on app load: resolve the goal from
 *                               users/{uid}.progression (+ the last 14 days of
 *                               dailyActivity when a weekly auto recompute is
 *                               due), persist the recompute, stamp it on today.
 *   setStepGoalChoice(uid, …)   the settings row: 'auto' or a manual number.
 *
 * Writes only `progression.dailyStepGoal / stepGoalMode / stepGoalComputedOn`
 * on the user's own doc (allowed by firestore.rules — only coins / level / XP
 * are locked inside `progression`).
 */
import {
  collection, doc, getDocs, limit, orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { UserFullProfile } from '@/types/user-profile';
import { getTodayString, useActivityStore } from '../store/useActivityStore';
import {
  addDays,
  BASE_STEP_GOAL,
  resolveStepGoal,
  sanitizeManualStepGoal,
  stepGoalNeedsRecentDays,
  STEP_GOAL_RECOMPUTE_DAYS,
  STEP_GOAL_WINDOW_DAYS,
  type StepDay,
  type ResolvedStepGoal,
  type StepGoalMode,
  type StepGoalProgressionFields,
} from '../lib/step-goal';

/** One resolve per uid per day (useDailyActivity mounts in many screens). */
const resolvedFor = new Map<string, Promise<ResolvedStepGoal | null>>();

function progressionOf(): StepGoalProgressionFields {
  const p = useUserStore.getState().profile?.progression as StepGoalProgressionFields | undefined;
  return p ?? {};
}

function mirrorToProfile(fields: Record<string, unknown>): void {
  useUserStore.getState().updateProfile({
    progression: fields as unknown as UserFullProfile['progression'],
  });
}

async function persist(uid: string, fields: { dailyStepGoal: number; stepGoalMode: StepGoalMode; stepGoalComputedOn?: string | null }) {
  const update: Record<string, unknown> = {
    'progression.dailyStepGoal': fields.dailyStepGoal,
    'progression.stepGoalMode': fields.stepGoalMode,
  };
  if (fields.stepGoalComputedOn !== undefined) update['progression.stepGoalComputedOn'] = fields.stepGoalComputedOn;
  await updateDoc(doc(db, 'users', uid), update);
  mirrorToProfile({
    dailyStepGoal: fields.dailyStepGoal,
    stepGoalMode: fields.stepGoalMode,
    ...(fields.stepGoalComputedOn !== undefined ? { stepGoalComputedOn: fields.stepGoalComputedOn } : {}),
  });
}

/** Last days' steps. Unlike getStepsTrend this THROWS on failure / offline,
 *  so a failed read never persists a recompute made from "no data". */
async function fetchRecentDays(uid: string): Promise<StepDay[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const snap = await getDocs(query(
    collection(db, 'dailyActivity'),
    where('userId', '==', uid),
    orderBy('date', 'desc'),
    limit(STEP_GOAL_WINDOW_DAYS + 1),
  ));
  return snap.docs.map((d) => {
    const data = d.data();
    return { date: String(data.date ?? ''), steps: Number(data.steps) || 0 };
  });
}

async function resolveNow(uid: string): Promise<ResolvedStepGoal | null> {
  const today = getTodayString();
  const progression = progressionOf();
  const recentDays = stepGoalNeedsRecentDays(progression, today)
    ? await fetchRecentDays(uid)
    : [];
  const resolved = resolveStepGoal(progression, recentDays, today);
  useActivityStore.getState().applyResolvedStepGoal(resolved.goal);
  if (resolved.shouldPersist && resolved.persist) {
    try {
      await persist(uid, resolved.persist);
    } catch (err) {
      // Non-fatal: the goal is still applied locally; the next load retries.
      console.warn('[StepGoal] could not persist the weekly recompute:', err);
    }
  }
  return resolved;
}

export function refreshStepGoal(uid: string): Promise<ResolvedStepGoal | null> {
  if (!uid) return Promise.resolve(null);
  const key = `${uid}_${getTodayString()}`;
  let pending = resolvedFor.get(key);
  if (!pending) {
    pending = resolveNow(uid).catch((err) => {
      console.warn('[StepGoal] resolve failed:', err);
      resolvedFor.delete(key);
      return null;
    });
    resolvedFor.set(key, pending);
  }
  return pending;
}

/**
 * Settings choice. 'auto' back-dates the computed-on stamp by a week so the
 * adaptive goal is recomputed right away, starting from the user's current
 * goal (within the ±1000 weekly cap); a manual number is snapped to the 500
 * grid.
 */
export async function setStepGoalChoice(uid: string, choice: 'auto' | number): Promise<number> {
  const current = useActivityStore.getState().resolvedStepGoal;
  if (choice === 'auto') {
    await persist(uid, current
      ? {
          dailyStepGoal: current,
          stepGoalMode: 'auto',
          stepGoalComputedOn: addDays(getTodayString(), -STEP_GOAL_RECOMPUTE_DAYS),
        }
      : { dailyStepGoal: BASE_STEP_GOAL, stepGoalMode: 'auto', stepGoalComputedOn: null });
  } else {
    const goal = sanitizeManualStepGoal(choice);
    if (goal == null) throw new Error('invalid step goal');
    await persist(uid, { dailyStepGoal: goal, stepGoalMode: 'manual' });
  }
  resolvedFor.delete(`${uid}_${getTodayString()}`);
  const resolved = await refreshStepGoal(uid);
  return resolved?.goal ?? current ?? 0;
}
