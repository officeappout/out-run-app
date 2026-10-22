/**
 * Running-plan catch-up (enable_week_builder_v1, owner 22.10) — where a week-by-week running
 * plan continues after runs did not happen. Pure: no Firebase, no clock.
 *
 *   one run missed in a plan week        → just re-arrange the week; the plan advances
 *   < 50% of a plan week's runs done      → that plan week repeats
 *   a full plan week with no runs         → repeat the last completed week
 *   gap 2–3 weeks                         → step back 1 week (beginner plans: 2)
 *   gap 4+ weeks                          → beginner plans restart from week 1; other plans step
 *                                           back to about half, and the level check is offered.
 *                                           Never silent: the "חוזרים לרוץ" drawer asks first.
 *
 * "Beginner plans" = the 0→5 km / 5→10 km plans: couch_to_5k / pace profile 3 / the beginner
 * running level. The result is a TARGET week; the writer moves the plan's start so that week
 * begins today (buildFreshWeekRunningProgram — the same move calm return makes). Copy is calm:
 * "מתחילים מהשבוע ה-X, בקצב שמתאים לך" — never "פספסת" / "נכשלת".
 */
import { resolveResumeWeek, type FreshWeekScheduleEntry } from './running';

export const RUN_CATCH_UP = {
  /** A plan week with fewer than this share of its runs done repeats. */
  repeatBelowShare: 0.5,
  /** Gap (days since the last workout) from which the plan steps back. */
  stepBackGapDays: 14,
  /** Gap from which beginner plans restart / other plans go back to about half. */
  restartGapDays: 28,
  stepBackWeeks: 1,
  beginnerStepBackWeeks: 2,
  /** Other plans after a 4+ week gap: back to this share of the week reached (rounded up). */
  longGapKeepShare: 0.5,
  /** From this gap the "חוזרים לרוץ" drawer asks before anything changes (owner: 4+ weeks). */
  askGapDays: 28,
  /** "להמשיך מאיפה שעצרתי" stays safe only while the week reached is this early in the plan. */
  resumeSafeMaxWeek: 2,
} as const;

export type CatchUpReason =
  | 'advance'
  | 'repeat_week'
  | 'repeat_last_completed'
  | 'step_back'
  | 'restart'
  | 'half_back';

export interface CatchUpDecision {
  reason: CatchUpReason;
  /** The plan week to run next. */
  targetWeek: number;
  /** The week the user had reached (for "להמשיך מאיפה שעצרתי"). */
  reachedWeek: number;
  /** Offer the optional level check (other plans after 4+ weeks). */
  offerLevelCheck: boolean;
  /** Ask in the "חוזרים לרוץ" drawer before applying (gap ≥ askGapDays). */
  ask: boolean;
}

export interface CatchUpInput {
  schedule: readonly FreshWeekScheduleEntry[];
  /** The plan week today falls in (calculateCurrentWeek of the stored start). */
  planWeek: number;
  /** Whole days since the last real workout (getDaysAway); null = unknown → no gap rule. */
  daysAway: number | null;
  beginner: boolean;
}

export interface BeginnerPlanProfile {
  currentGoal?: string | null;
  paceProfile?: { profileType?: number } | null;
}

export const isBeginnerRunPlan = (running: BeginnerPlanProfile | null | undefined, level?: string | null): boolean =>
  running?.currentGoal === 'couch_to_5k' || running?.paceProfile?.profileType === 3 || level === 'beginner';

const weekShare = (schedule: readonly FreshWeekScheduleEntry[], week: number): { total: number; done: number } => {
  const entries = schedule.filter((e) => e.week === week);
  return { total: entries.length, done: entries.filter((e) => e.status === 'completed').length };
};

/** The latest week before `before` with at least half of its runs done; 1 when none. */
export function lastCompletedWeek(schedule: readonly FreshWeekScheduleEntry[], before: number): number {
  for (let w = before - 1; w >= 1; w--) {
    const { total, done } = weekShare(schedule, w);
    if (total > 0 && done / total >= RUN_CATCH_UP.repeatBelowShare) return w;
  }
  return 1;
}

export function resolveRunCatchUp(i: CatchUpInput): CatchUpDecision {
  const reachedWeek = resolveResumeWeek([...i.schedule]);
  const base = { reachedWeek, offerLevelCheck: false, ask: false };
  const gap = i.daysAway ?? 0;

  if (gap >= RUN_CATCH_UP.restartGapDays) {
    const ask = gap >= RUN_CATCH_UP.askGapDays;
    if (i.beginner) return { ...base, reason: 'restart', targetWeek: 1, ask };
    const half = Math.max(1, Math.ceil(reachedWeek * RUN_CATCH_UP.longGapKeepShare));
    return { ...base, reason: 'half_back', targetWeek: half, offerLevelCheck: true, ask };
  }
  if (gap >= RUN_CATCH_UP.stepBackGapDays) {
    const back = i.beginner ? RUN_CATCH_UP.beginnerStepBackWeeks : RUN_CATCH_UP.stepBackWeeks;
    return { ...base, reason: 'step_back', targetWeek: Math.max(1, reachedWeek - back), ask: gap >= RUN_CATCH_UP.askGapDays };
  }

  // No long gap: judge the plan week that just ended.
  const prev = i.planWeek - 1;
  const advance: CatchUpDecision = { ...base, reason: 'advance', targetWeek: i.planWeek };
  if (prev < 1) return advance;
  const { total, done } = weekShare(i.schedule, prev);
  if (total === 0) return advance;
  if (done === 0) return { ...base, reason: 'repeat_last_completed', targetWeek: lastCompletedWeek(i.schedule, prev) };
  if (done / total < RUN_CATCH_UP.repeatBelowShare) return { ...base, reason: 'repeat_week', targetWeek: prev };
  return advance;
}

/** "להמשיך מאיפה שעצרתי" — only inside safe limits (no long gap, or still at the plan's start). */
export function canResumeWhereStopped(d: Pick<CatchUpDecision, 'reachedWeek'>, daysAway: number | null): boolean {
  return (daysAway ?? 0) < RUN_CATCH_UP.stepBackGapDays || d.reachedWeek <= RUN_CATCH_UP.resumeSafeMaxWeek;
}

/** The calm one-liner for a change of week (null when nothing changes). */
export function catchUpLineHe(d: Pick<CatchUpDecision, 'reason' | 'targetWeek'>): string | null {
  if (d.reason === 'advance') return null;
  if (d.reason === 'restart') return 'מתחילים מחדש מהשבוע הראשון, בקצב שמתאים לך';
  return `ממשיכים מהשבוע ה-${d.targetWeek}, בקצב שמתאים לך`;
}

/** One-line "why" for the drawer's recommendation. */
export function catchUpWhyHe(d: Pick<CatchUpDecision, 'reason'>, beginner: boolean): string {
  switch (d.reason) {
    case 'restart':
      return 'אחרי הפסקה ארוכה הגוף צריך לבנות שוב את הבסיס — זה הכי בטוח וזה עובר מהר';
    case 'half_back':
      return 'אחרי הפסקה ארוכה חוזרים לנפח שהגוף עוד זוכר, ומשם עולים בהדרגה';
    case 'step_back':
      return beginner ? 'שבועיים אחורה מחזירים את הקצב בלי להעמיס' : 'שבוע אחורה מחזיר את הקצב בלי להעמיס';
    case 'repeat_week':
    case 'repeat_last_completed':
      return 'עוד שבוע באותו קצב בונה בסיס יציב להמשך';
    default:
      return 'ממשיכים לפי התוכנית';
  }
}

const KEY_MS = (k: string) => Date.parse(`${k}T00:00:00Z`);

/**
 * Judge now? Not when this plan week was already judged (a catch-up applied on / after its first
 * day), and not while the same gap goes on (no workout since the last catch-up — stepping back
 * again every week of one break would punish the break twice).
 */
export function catchUpDue(i: { marker: unknown; planWeekStartKey: string; todayKey: string; daysAway: number | null }): boolean {
  const appliedOn = (i.marker as { appliedOn?: unknown } | null)?.appliedOn;
  if (typeof appliedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(appliedOn)) return true;
  if (appliedOn >= i.planWeekStartKey) return false;
  const sinceApplied = Math.round((KEY_MS(i.todayKey) - KEY_MS(appliedOn)) / 86_400_000);
  return !(i.daysAway != null && sinceApplied < i.daysAway);
}
