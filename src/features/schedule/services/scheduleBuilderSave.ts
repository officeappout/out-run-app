/**
 * Schedule builder — the SAVE path (schedule advisor phase A), behind
 * SCHEDULE_BUILDER_SAVE_V1 (default OFF: the drawer stays preview-only). Executes a
 * SchedulePlan (scheduleBuilderSave.plan.ts, pure + tested) through the EXISTING writers:
 *   from_now   userSchedule.service replaceRecurringSchedule (template merged with
 *              mergeDayItems by the planner) → running-schedule-write.service
 *              completeRunningScheduleFirstChoice (rebuilds the run plan with
 *              mergePreservedHistory; history is kept, never restarted)
 *   this_week  userSchedule.service addScheduleEntry / removeScheduleEntry day overrides
 *              (removeScheduleEntry's own rest-override tombstone keeps a vacated day
 *              from being re-hydrated from the template)
 * Nothing here decides anything: the plan is the decision, this only writes it.
 */
import { SCHEDULE_BUILDER_SAVE_V1 } from '@/config/feature-flags';
import {
  addScheduleEntry,
  getScheduleDay,
  removeScheduleEntry,
  replaceRecurringSchedule,
  saveScheduleAdvisorPrefs,
} from '@/features/user/scheduling/services/userSchedule.service';
import {
  completeRunningScheduleFirstChoice,
  type CompleteRunningScheduleChoiceResult,
} from '@/features/workout-engine/core/services/running-schedule-write.service';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import type { SchedulePlan } from './scheduleBuilderSave.plan';

/** localStorage override for one device, same pattern as isScheduleBuilderDrawerEnabled: localStorage['OUT_SCHEDULE_SAVE'] = '1' | '0'. */
export function isScheduleBuilderSaveEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_SCHEDULE_SAVE');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  }
  return SCHEDULE_BUILDER_SAVE_V1;
}

export interface SaveOutcome {
  ok: boolean;
  reason?: 'disabled' | 'write_failed';
  running?: CompleteRunningScheduleChoiceResult | null;
  runningSkipped: SchedulePlan['runningSkipped'];
}

async function clearStrengthEntries(uid: string, date: string): Promise<void> {
  const day = await getScheduleDay(uid, date);
  for (const e of day?.entries ?? []) {
    if (e.type === 'training' && e.source !== 'community' && !e.plannedRun && e.entryId) {
      await removeScheduleEntry(uid, date, e.entryId);
    }
  }
}

export async function saveScheduleProposal(
  plan: SchedulePlan,
  ctx: { uid: string; runningTime: string },
): Promise<SaveOutcome> {
  if (!isScheduleBuilderSaveEnabled()) return { ok: false, reason: 'disabled', runningSkipped: plan.runningSkipped };

  try {
    if (plan.scope === 'from_now') {
      const ok = await replaceRecurringSchedule(plan.recurringTemplate ?? {}, plan.lifestyleScheduleDays ?? [], plan.prefs);
      if (!ok) return { ok: false, reason: 'write_failed', runningSkipped: plan.runningSkipped };
      let running: CompleteRunningScheduleChoiceResult | null = null;
      if (plan.runningScheduleDays && plan.runningFrequency) {
        running = await completeRunningScheduleFirstChoice({
          uid: ctx.uid,
          scheduleDays: plan.runningScheduleDays,
          frequency: plan.runningFrequency,
          time: ctx.runningTime,
        });
      }
      return { ok: true, running, runningSkipped: plan.runningSkipped };
    }

    for (const o of plan.dayOverrides) {
      await clearStrengthEntries(ctx.uid, o.date);
      const nowIso = new Date().toISOString();
      const entry: UserScheduleEntry = o.strengthProgramIds
        ? {
            userId: ctx.uid,
            date: o.date,
            type: 'training',
            source: 'manual',
            completed: false,
            programIds: o.strengthProgramIds,
            scheduledCategories: ['strength'],
            createdAt: nowIso,
            updatedAt: nowIso,
          }
        : {
            userId: ctx.uid,
            date: o.date,
            type: 'rest',
            source: 'manual',
            completed: false,
            programIds: [],
            override: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
      const after = await getScheduleDay(ctx.uid, o.date);
      const alreadyTombstoned = !o.strengthProgramIds && (after?.entries ?? []).some((e) => e.type === 'rest' && e.override);
      if (!alreadyTombstoned) await addScheduleEntry(ctx.uid, o.date, entry);
    }
    await saveScheduleAdvisorPrefs(plan.prefs);
    return { ok: true, running: null, runningSkipped: plan.runningSkipped };
  } catch (err) {
    console.error('[ScheduleBuilderSave] save failed', err);
    return { ok: false, reason: 'write_failed', runningSkipped: plan.runningSkipped };
  }
}
