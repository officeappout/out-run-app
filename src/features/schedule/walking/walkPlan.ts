/**
 * Walking plan — the algorithm (enable_home_v2, owner 20.10.2026). Pure.
 *
 * Not a month-based program: a weekly-minutes target that ramps gently from what
 * the user already does, split into 3–5 brisk walks.
 *
 *   level   = recent steps (adaptive step goal ÷ 1.1 ≈ the 14-day median, #414)
 *   target  = the goal's weekly minutes inside the WHO 150–300 band (older adults:
 *             the WHO minimum + a balance note)
 *   week k  = start(level) × 1.1^k, capped at the target, rounded down to 5′
 *   walks   = weekly minutes ÷ the comfortable walk length → 3–5, never more than
 *             the days the user has; each walk 20–45′; one longer walk a week
 *   target  = time for most walks; the long walk (and every walk for the "steps"
 *             goal) is a distance — the free walk player's own goal types
 *
 * Every number comes from walkPlan.config.ts.
 */
import { WALK_PLAN_CONFIG, type WalkPlanConfig } from './walkPlan.config';
import type {
  PlannedWalk,
  WalkActivityLevel,
  WalkAudience,
  WalkComfort,
  WalkGoal,
  WalkPlan,
  WalkPlanInput,
  WalkTarget,
  WalkWeek,
} from './walkPlan.types';

/** Sunday–Friday: Saturday is off unless the user marks it (policy saturdayDefaultOff). */
export const DEFAULT_WALK_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5];
const FRIDAY = 5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const floor5 = (n: number) => Math.floor(n / 5) * 5;
const round5 = (n: number) => Math.round(n / 5) * 5;

export function activityLevelFromStepGoal(stepGoal: number | null | undefined, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): WalkActivityLevel {
  if (typeof stepGoal !== 'number' || !Number.isFinite(stepGoal) || stepGoal <= 0) return 'low';
  const median = stepGoal / cfg.stepGoalStretch;
  if (median < cfg.levelStepBounds.sedentary) return 'sedentary';
  if (median < cfg.levelStepBounds.low) return 'low';
  if (median < cfg.levelStepBounds.moderate) return 'moderate';
  return 'active';
}

export function targetWeeklyMinutes(goal: WalkGoal, audience: WalkAudience, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  const byGoal = cfg.goalTargetMinutes[goal] ?? cfg.who.minWeeklyMinutes;
  const t = audience === 'senior' ? Math.min(byGoal, cfg.seniorTargetMinutes) : byGoal;
  return clamp(t, cfg.who.minWeeklyMinutes, cfg.who.maxWeeklyMinutes);
}

/**
 * Weekly minutes for `weeks` weeks: from `start`, each week ≤ +cap over the one
 * before (rounded down to 5′), never above `target`.
 */
export function weeklyMinutesRamp(start: number, target: number, weeks: number, cap: number): number[] {
  const out: number[] = [];
  let cur = Math.min(floor5(start), target);
  for (let i = 0; i < weeks; i++) {
    out.push(cur);
    const next = floor5(cur * (1 + cap));
    cur = Math.min(target, Math.max(cur, next));
  }
  return out;
}

/** The comfortable walk length (older adults: never above 30′ to start). */
export function preferredSessionMinutes(comfort: WalkComfort, audience: WalkAudience, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  const m = cfg.comfortSessionMinutes[comfort];
  return clamp(audience === 'senior' ? Math.min(m, 30) : m, cfg.session.min, cfg.session.max);
}

export function walkFrequency(peakWeekMinutes: number, sessionMinutes: number, availableCount: number, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  const byMinutes = clamp(Math.round(peakWeekMinutes / Math.max(1, sessionMinutes)), cfg.frequency.min, cfg.frequency.max);
  // Fewer free days than the minimum → every free day (the walks get longer instead).
  const fewest = Math.max(1, availableCount);
  return Math.min(byMinutes, fewest);
}

/** `n` days spread across the available ones (Sun–Fri, 3 → א ג ה; 4 → א ב ד ה). */
export function pickWalkDays(n: number, available: readonly number[]): number[] {
  const pool = Array.from(new Set(available.filter((d) => d >= 0 && d <= 6))).sort((a, b) => a - b);
  if (n >= pool.length) return pool;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor((i * pool.length) / n)]);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** The long walk's day: Friday when it is a walk day, else the last walk day of the week. */
export function longWalkDay(days: readonly number[]): number | null {
  if (days.length < 2) return null;
  return days.includes(FRIDAY) ? FRIDAY : [...days].sort((a, b) => a - b)[days.length - 1];
}

export function distanceForMinutes(minutes: number, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  const km = Math.round((minutes * cfg.kmPerMinute) / cfg.distanceStepKm) * cfg.distanceStepKm;
  return Math.max(1, Math.round(km * 100) / 100);
}

export function stepsForMinutes(minutes: number, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  return Math.round((minutes * cfg.stepsPerMinute) / 100) * 100;
}

function targetFor(minutes: number, distance: boolean, cfg: WalkPlanConfig): WalkTarget {
  return distance ? { type: 'distance', km: distanceForMinutes(minutes, cfg) } : { type: 'time', minutes };
}

/** One week: `total` minutes over `days`, one longer walk, every walk inside the session bounds. */
export function buildWalkWeek(
  index: number,
  total: number,
  days: readonly number[],
  goal: WalkGoal,
  cfg: WalkPlanConfig = WALK_PLAN_CONFIG,
): WalkWeek {
  const sorted = [...days].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { index, totalMinutes: 0, walks: [] };
  const { min, max } = cfg.session;
  const longDow = longWalkDay(sorted);
  const base = total / n;
  const longMinutes = longDow == null ? 0 : clamp(round5(base * cfg.longWalkFactor), min, max);
  const others = longDow == null ? n : n - 1;
  const restMinutes = clamp(floor5((total - longMinutes) / Math.max(1, others)), min, max);
  const allDistance = goal === 'steps';

  const walks: PlannedWalk[] = sorted.map((dow) => {
    const isLong = dow === longDow;
    // The long walk is never shorter than the others.
    const minutes = isLong ? Math.max(longMinutes, restMinutes) : restMinutes;
    return {
      dow,
      minutes,
      target: targetFor(minutes, allDistance || isLong, cfg),
      isLong,
      estSteps: stepsForMinutes(minutes, cfg),
    };
  });
  return { index, totalMinutes: walks.reduce((s, w) => s + w.minutes, 0), walks };
}

const LEVEL_REASON_HE: Record<WalkActivityLevel, string> = {
  sedentary: 'לפי הצעדים שלך מתחילים בעדינות',
  low: 'מתחילים ממה שכבר עושים ועולים בהדרגה',
  moderate: 'כבר זזים לא מעט — בונים על זה',
  active: 'כבר פעילים — שומרים על הקצב ומוסיפים מעט',
};

/**
 * The plan. `daysOverride` = the days the user picked on the days step (the walks
 * follow them; the count stays the recommended one unless they picked fewer).
 */
export function recommendWalkPlan(input: WalkPlanInput, cfg: WalkPlanConfig = WALK_PLAN_CONFIG, daysOverride?: readonly number[]): WalkPlan {
  const level = activityLevelFromStepGoal(input.stepGoal, cfg);
  const target = targetWeeklyMinutes(input.goal, input.audience, cfg);
  const start = Math.min(cfg.startMinutesByLevel[level], target);
  const ramp = weeklyMinutesRamp(start, target, cfg.horizonWeeks, cfg.weeklyRampCap);
  const available = input.availableDays.length ? input.availableDays : [...DEFAULT_WALK_DAYS];
  const session = preferredSessionMinutes(input.comfort, input.audience, cfg);
  const frequency = walkFrequency(ramp[ramp.length - 1] ?? start, session, available.length, cfg);
  const days = daysOverride && daysOverride.length ? [...daysOverride].sort((a, b) => a - b) : pickWalkDays(frequency, available);
  const weeks = ramp.map((total, i) => buildWalkWeek(i, total, days, input.goal, cfg));

  const reasonsHe = [
    `${LEVEL_REASON_HE[level]} · עד 10% יותר כל שבוע`,
    `היעד: ${target} דק׳ הליכה מהירה בשבוע — לפי המלצת ארגון הבריאות העולמי`,
  ];
  if (input.audience === 'senior') reasonsHe.push('כדאי להוסיף תרגילי שיווי משקל קצרים');
  return { level, targetWeeklyMinutes: target, frequency, days, weeks, reasonsHe };
}

/**
 * A short walk that closes today's step gap ("חסרים 2,400 · ~20 דק׳"), or null
 * when the goal is met / unknown.
 */
export function stepGapWalk(
  stepsToday: number | null | undefined,
  stepGoal: number | null | undefined,
  cfg: WalkPlanConfig = WALK_PLAN_CONFIG,
): { missingSteps: number; minutes: number } | null {
  if (typeof stepGoal !== 'number' || stepGoal <= 0) return null;
  const missing = Math.round(stepGoal - Math.max(0, Number(stepsToday) || 0));
  if (missing <= 0) return null;
  const minutes = clamp(Math.ceil(missing / cfg.stepsPerMinute / 5) * 5, cfg.gapWalk.min, cfg.gapWalk.max);
  return { missingSteps: missing, minutes };
}

/** "30 דק׳" / "3 ק״מ" */
export function walkTargetLabelHe(t: WalkTarget): string {
  return t.type === 'time' ? `${t.minutes} דק׳` : `${t.km} ק״מ`;
}
