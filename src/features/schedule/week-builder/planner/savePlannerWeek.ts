/**
 * Saves an edited planner week (enable_week_builder_v1) in one call — the "סידור השבוע"
 * sheet's confirm and planner v2's quick drag on the week rows share it: plan the save from the
 * user's current template (planPlannerSave), run it on the existing persistence
 * (executePlannerSave), and refresh the profile when the template or the run moves changed.
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { isStrengthTemplateId } from '../../engine/strengthVocabulary';
import { planPlannerSave, runDateMoves, type PlannerSaveScope } from './plannerSave.plan';
import { executePlannerSave } from './plannerSave.service';
import type { PlannerWeek } from './plannerWeek';

type LifestyleLike = { lifestyle?: { recurringTemplate?: Record<string, string[]>; scheduleDays?: string[] }; running?: { runMoves?: unknown } };

export async function savePlannerWeek(
  userId: string,
  week: PlannerWeek,
  keys: readonly string[],
  todayKey: string,
  scope: PlannerSaveScope,
): Promise<boolean> {
  const profile = useUserStore.getState().profile as LifestyleLike | null;
  const template = profile?.lifestyle?.recurringTemplate ?? {};
  const plan = planPlannerSave(week, [...keys], todayKey, scope, {
    recurringTemplate: template,
    scheduleDays: profile?.lifestyle?.scheduleDays ?? [],
    isStrengthId: (id) => isStrengthTemplateId(id, resolveToSlug),
  });
  const res = await executePlannerSave(userId, plan, template, { existing: profile?.running?.runMoves, todayKey });
  if (res.ok && (plan.template || runDateMoves(plan.moves).length)) useUserStore.getState().refreshProfile().catch(() => {});
  return res.ok;
}
