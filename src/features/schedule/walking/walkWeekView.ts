/**
 * Walking week — what the week step / home show (enable_home_v2). Pure formatting
 * over the plan (walkPlan.ts): titles, the per-day lines, the optional light
 * core add-on days (display only, from the recommendation policy's add-on, #529).
 */
import type { PolicyAddOn } from '../recommendation-policy/types';
import { walkTargetLabelHe } from './walkPlan';
import { LONG_WALK_TITLE_HE, WALK_TITLE_HE } from './walkSchedule';
import type { PlannedWalk, WalkGoal, WalkPlan, WalkWeek } from './walkPlan.types';

export const WALK_GOAL_COPY: Record<WalkGoal, { title: string; sub: string }> = {
  weight_loss: { title: 'ירידה במשקל', sub: 'הליכה מהירה רוב הימים, נבנה בהדרגה' },
  health: { title: 'בריאות ותנועה', sub: 'להזיז את הגוף בלי לחץ' },
  steps: { title: 'להגיע ליעד הצעדים', sub: 'כל הליכה נספרת ליעד היומי' },
  belly: { title: 'להוריד בטן', sub: 'הליכה + ליבה קצרה פעמיים בשבוע' },
};

const fmt = (n: number) => n.toLocaleString('he-IL');

export function walkPieceTitle(w: Pick<PlannedWalk, 'isLong'>): string {
  return w.isLong ? LONG_WALK_TITLE_HE : WALK_TITLE_HE;
}

/** "קצב מהיר · 30 דק׳ · ~3,300 צעדים" */
export function walkPieceSubtitle(w: PlannedWalk): string {
  return `קצב מהיר · ${walkTargetLabelHe(w.target)} · ~${fmt(w.estSteps)} צעדים`;
}

/** The days that also get the add-on: spread over the walk days, never the long walk's. */
export function addOnDays(walkDays: readonly number[], perWeek: number, longDow: number | null): number[] {
  if (perWeek <= 0) return [];
  const pool = [...walkDays].sort((a, b) => a - b).filter((d) => d !== longDow);
  const src = pool.length ? pool : [...walkDays];
  if (perWeek >= src.length) return src;
  const out: number[] = [];
  for (let i = 0; i < perWeek; i++) out.push(src[Math.floor(((i + 0.5) * src.length) / perWeek)]);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

export interface WalkDayView {
  dow: number;
  walk: { title: string; subtitle: string; isLong: boolean } | null;
  addOn: { title: string; subtitle: string } | null;
}

export function walkWeekDays(week: WalkWeek, addOn: PolicyAddOn | null): WalkDayView[] {
  const longDow = week.walks.find((w) => w.isLong)?.dow ?? null;
  const extra = addOn ? addOnDays(week.walks.map((w) => w.dow), addOn.perWeek, longDow) : [];
  return Array.from({ length: 7 }, (_, dow) => {
    const w = week.walks.find((x) => x.dow === dow);
    return {
      dow,
      walk: w ? { title: walkPieceTitle(w), subtitle: walkPieceSubtitle(w), isLong: w.isLong } : null,
      addOn: addOn && extra.includes(dow) ? { title: 'ליבה וגב', subtitle: `חיזוק קל · בבית · ${addOn.minutes} דק׳` } : null,
    };
  });
}

/** "4 הליכות בשבוע · ~30 דק׳" */
export function walkRecommendationTitle(plan: WalkPlan): string {
  const w0 = plan.weeks[0];
  const usual = w0?.walks.find((w) => !w.isLong) ?? w0?.walks[0];
  return `${plan.frequency} הליכות בשבוע${usual ? ` · ~${usual.minutes} דק׳` : ''}`;
}

/** "שבוע 1: 90 דק׳ ← שבוע 4: 120 דק׳" — the gentle ramp. */
export function walkRampLine(plan: WalkPlan): string | null {
  const first = plan.weeks[0];
  const last = plan.weeks[plan.weeks.length - 1];
  if (!first || !last || last.totalMinutes <= first.totalMinutes) return null;
  return `שבוע 1: ${first.totalMinutes} דק׳ ← שבוע ${plan.weeks.length}: ${last.totalMinutes} דק׳`;
}

/** "הליכה · 4 × 30 דק׳ + ליבה פעמיים" */
export function walkWeekSubtitle(plan: WalkPlan, addOn: PolicyAddOn | null): string {
  const w0 = plan.weeks[0];
  const usual = w0?.walks.find((w) => !w.isLong) ?? w0?.walks[0];
  const head = `הליכה · ${plan.frequency} × ${usual ? usual.minutes : 30} דק׳`;
  return addOn ? `${head} + ליבה ${addOn.perWeek === 2 ? 'פעמיים' : `×${addOn.perWeek}`}` : head;
}

/** Estimated steps of a planned walk from its saved goal (time → min × 110; distance → km ÷ km/min × 110). */
export function plannedWalkSteps(plannedRun: unknown, stepsPerMinute = 110, kmPerMinute = 0.09): number | null {
  const goal = (plannedRun as { goal?: { type?: unknown; value?: unknown } } | null)?.goal;
  const v = typeof goal?.value === 'number' && goal.value > 0 ? goal.value : null;
  if (!v) return null;
  const minutes = goal?.type === 'time' ? v : goal?.type === 'distance' ? v / kmPerMinute : null;
  return minutes == null ? null : Math.round((minutes * stepsPerMinute) / 100) * 100;
}

/** "30 דק׳" / "2.5 ק״מ" from a saved plannedRun goal. */
export function plannedWalkTargetHe(plannedRun: unknown): string | null {
  const goal = (plannedRun as { goal?: { type?: unknown; value?: unknown } } | null)?.goal;
  if (typeof goal?.value !== 'number') return null;
  return goal.type === 'time' ? `${goal.value} דק׳` : goal.type === 'distance' ? `${goal.value} ק״מ` : null;
}

/** The step ring line under today's walk (WR-4). */
export function walkStepsHint(stepsToday: number, stepGoal: number | null, walkSteps: number | null): string | null {
  if (!stepGoal || stepGoal <= 0 || stepsToday >= stepGoal) return null;
  if (!walkSteps) return null;
  return stepsToday + walkSteps >= stepGoal
    ? `ההליכה של היום תסגור את הטבעת: ${fmt(stepsToday)} + ~${fmt(walkSteps)}`
    : `ההליכה של היום תוסיף ~${fmt(walkSteps)} צעדים`;
}
