/**
 * Add track — the SAVE (enable_home_v2, journeys J3 / J4). Executes the pure plan
 * (schedule/add-track/addTrackSave.ts) through the existing fields and writers only:
 *
 *   1. lifestyle.recurringTemplate + lifestyle.scheduleDays — one dotted updateDoc, built
 *      from a FRESH read of the stored template (mergeDayItems per day: the other domain's
 *      ids are kept). Skipped when the plan says null (nothing to write — never erase).
 *   2. Runs:
 *      - J3 (strength user adds running): the onboarding store fields the run step always
 *        wrote (buildRunScheduleWrite → 'user-chosen'); the signup's COMPLETED sync
 *        (health page) builds the plan from them — the same path every run signup takes.
 *        Written AFTER step 1 so that sync reads the new template.
 *      - J4 (runner adds strength): completeRunningScheduleFirstChoice when the run days
 *        changed or were never confirmed (rebuilds with history preserved; marks
 *        'user-chosen'; unions lifestyle.scheduleDays — never drops a day).
 * Throws nothing: returns { ok:false } so the screen can offer a retry.
 */
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { completeRunningScheduleFirstChoice } from '@/features/workout-engine/core/services/running-schedule-write.service';
import { isRunningScheduleUserConfirmed } from '@/lib/running-schedule-source';
import { useOnboardingStore } from '../store/useOnboardingStore';
import type { OnboardingData } from '../types';
import { DAY_LETTERS_HE, buildRunScheduleWrite, windowOfTime, DEFAULT_RUN_WINDOW } from '@/features/schedule/utils/runWeekRecommendation';
import { planAddTrackSave, type AddTrackSaveInput, type AddTrackSavePlan } from '@/features/schedule/add-track/addTrackSave';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';

export interface AddTrackSaveOutcome {
  ok: boolean;
  plan: AddTrackSavePlan | null;
}

/** The store payload for a NEW running track (J3) — the run step's own fields. */
export function newRunningStoreWrite(plan: AddTrackSavePlan, runTime: string, longRunDow: number | null): Partial<OnboardingData> {
  const window: TimeWindow = windowOfTime(runTime) ?? DEFAULT_RUN_WINDOW;
  const windows: Partial<Record<number, TimeWindow>> = Object.fromEntries(plan.runDays.map((d) => [d, window]));
  const write = buildRunScheduleWrite({
    days: plan.runDays,
    windows,
    strengthDayLetters: plan.strengthDays.map((d) => DAY_LETTERS_HE[d]),
  });
  return {
    ...write,
    // A custom time the presets don't cover is kept as the user gave it.
    runningScheduleTime: runTime,
    runningScheduleDayWindows: windows,
    runningLongRunDay: longRunDow,
  } as Partial<OnboardingData>;
}

function strengthOnlyTemplate(t: Record<string, string[]>, isStrengthId: (id: string) => boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [letter, ids] of Object.entries(t)) {
    const s = ids.filter(isStrengthId);
    if (s.length) out[letter] = s;
  }
  return out;
}

export async function saveAddTrackWeek(
  uid: string,
  input: Omit<AddTrackSaveInput, 'template' | 'storedRunLetters'>,
  opts: { longRunDow: number | null },
): Promise<AddTrackSaveOutcome> {
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const data = (snap.exists() ? snap.data() : {}) as {
      lifestyle?: { recurringTemplate?: Partial<Record<string, string[]>> };
      running?: { scheduleDays?: string[]; scheduleDaysSource?: unknown };
    };
    const plan = planAddTrackSave({
      ...input,
      template: data.lifestyle?.recurringTemplate ?? {},
      storedRunLetters: Array.isArray(data.running?.scheduleDays) ? data.running!.scheduleDays! : [],
    });

    if (plan.recurringTemplate && plan.lifestyleScheduleDays) {
      await updateDoc(ref, {
        'lifestyle.recurringTemplate': plan.recurringTemplate,
        'lifestyle.scheduleDays': plan.lifestyleScheduleDays,
        updatedAt: serverTimestamp(),
      });
    }

    if (input.added === 'running') {
      if (plan.runDays.length) {
        const store = useOnboardingStore.getState();
        // A strength signup earlier in this session left its template in the store; the
        // store's own sync re-merges it per day, so it must hold the NEW strength days or
        // a moved session would come back to its old day.
        const storeTemplate = (store.data as { recurringTemplate?: Record<string, string[]> }).recurringTemplate;
        const templateSync =
          storeTemplate && Object.keys(storeTemplate).length && plan.recurringTemplate
            ? { recurringTemplate: strengthOnlyTemplate(plan.recurringTemplate, input.isStrengthId) }
            : {};
        store.updateData({ ...newRunningStoreWrite(plan, input.times.run, opts.longRunDow), ...templateSync } as Partial<OnboardingData>);
      }
      return { ok: true, plan };
    }

    const unconfirmed = !isRunningScheduleUserConfirmed(data);
    if (plan.runLetters.length && (plan.runsChanged || unconfirmed)) {
      const res = await completeRunningScheduleFirstChoice({
        uid,
        scheduleDays: plan.runLetters,
        frequency: plan.runLetters.length,
        time: input.times.run,
      });
      // The days + time are saved even when the plan rebuild fails (the writer's own rule).
      if (!res.ok && 'reason' in res) console.warn('[AddTrackSave] running plan data missing — run days kept as they were');
    }
    return { ok: true, plan };
  } catch (err) {
    console.error('[AddTrackSave] save failed', err);
    return { ok: false, plan: null };
  }
}

/**
 * J4's calendar toggle (the reminders step): settings.calendarSync, a dotted write — the
 * field ScheduleStep / LifestyleWizard already own. Only written when the user saw it.
 */
export async function saveAddTrackCalendarSync(uid: string, calendarSync: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), { 'settings.calendarSync': calendarSync, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('[AddTrackSave] calendar toggle not saved (non-fatal)', err);
  }
}
