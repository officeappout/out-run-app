/**
 * Planner save (enable_week_builder_v1, phase 2) — runs a PlannerSavePlan on the existing
 * schedule persistence only (no new collection, no new field):
 *   1. a moved session of a template day without a doc yet is hydrated first
 *      (hydrateFromTemplate), so every move below is by a real entryId — all hydration runs
 *      before any move, so a swap of two template days never picks the wrong entry;
 *   2. each entry moves date → date (moveScheduleEntry — the agenda drag's own write);
 *   3. 'forward' then writes the recurring template + scheduleDays (replaceRecurringTemplate);
 *   4. run moves (current week) go to the OPTIONAL running.runMoves field (saveRunMoves).
 */
import {
  hydrateFromTemplate,
  moveScheduleEntry,
  replaceRecurringTemplate,
} from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { entryMoves, runDateMoves, type PlannerMove, type PlannerSavePlan } from './plannerSave.plan';
import { saveRunMoves } from './runMoves.service';
import { planRunMoves } from '../../utils/runWeekMoves';

export interface PlannerSaveResult {
  ok: boolean;
  failed: number;
}

async function entryIdsOf(userId: string, m: PlannerMove, template: RecurringTemplate): Promise<string[]> {
  if (m.entryIds.length) return m.entryIds;
  const hydrated = await hydrateFromTemplate(userId, m.fromDate, template);
  return hydrated
    .filter((e) => e.type === 'training' && e.entryId && (e.programIds ?? []).some((id) => m.programIds.includes(id)))
    .map((e) => e.entryId!);
}

export async function executePlannerSave(
  userId: string,
  plan: PlannerSavePlan,
  template: RecurringTemplate,
  runs?: { existing: unknown; todayKey: string },
): Promise<PlannerSaveResult> {
  let failed = 0;
  const resolved: Array<{ m: PlannerMove; ids: string[] }> = [];
  for (const m of entryMoves(plan.moves)) resolved.push({ m, ids: await entryIdsOf(userId, m, template) });
  for (const { m, ids } of resolved) {
    if (ids.length === 0) failed++;
    for (const id of ids) {
      const ok = await moveScheduleEntry(userId, m.fromDate, m.toDate, undefined, id);
      if (!ok) failed++;
    }
  }
  const runMoves = runDateMoves(plan.moves);
  if (runMoves.length && runs) {
    const swaps = planRunMoves(runs.existing, runMoves);
    if (swaps.length && !(await saveRunMoves(userId, runs.existing, swaps, runs.todayKey))) failed++;
  }
  if (plan.template) {
    const ok = await replaceRecurringTemplate(plan.template.recurringTemplate, plan.template.scheduleDays);
    if (!ok) failed++;
  }
  return { ok: failed === 0, failed };
}
