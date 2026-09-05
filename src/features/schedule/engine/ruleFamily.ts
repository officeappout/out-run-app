/**
 * Rule Family Interface + Domain Adapters
 *
 * Uniform interface each rule family (strength, running) exposes to the
 * future weaver (.claude/knowledge/schedule-weaver-spec.md). The adapters
 * below are wrappers only — zero lines changed in scheduleRules.ts or
 * runningRules.ts.
 *
 * criticalityOrder was considered and rejected as a shared interface
 * member. It's a concept native to running: running has a fixed weekly
 * structure you can drop ONE workout from (quality/long/easy roles, RUN-05's
 * drop order). Strength has no equivalent — a strength week of N days isn't
 * "N+1 minus one," it's a template rebuilt from scratch for N days
 * (buildDefaultTemplate has no incremental "remove one session" operation,
 * and no existing criticality/drop-order concept was found anywhere in
 * scheduleRules.ts — confirmed by direct search, not assumed: the closest
 * thing, PRIORITY_VOLUME_WEIGHT/BASE_VOLUMES, lives inside
 * buildUpperCalisthenicsSession, a function with zero live callers, and
 * answers a different question — how much volume to give one skill inside
 * one session — not which day-type is safe to cut from a whole week). A
 * question only one domain can answer doesn't belong in a shared interface.
 * reduceTo replaces it: each domain decides HOW to reduce, using whatever
 * internal knowledge it actually has — running drops by criticality,
 * strength rebuilds.
 *
 * Confirmed before writing reduceTo's strength wording (read-only audit,
 * 05.09.2026, see the parallel investigation this round): buildDefaultTemplate
 * does NOT hold weekly volume constant across day counts. Every session it
 * builds gets a hardcoded volumePercent (100, or 50/60 for the PULL+PULL
 * special case's recovery/HANDSTAND slots) — daysPerWeek only changes how
 * many sessions exist, never how hard each one is. Going from 4 days to 3
 * means strictly less total weekly volume, not longer/harder remaining
 * sessions. (buildUpperCalisthenicsSession does compute a genuinely scaled
 * volume via PRIORITY_VOLUME_WEIGHT/BASE_VOLUMES, but buildDefaultTemplate
 * never calls it — confirmed dead relative to this path.)
 */

import type { ProgramId, PrioritizedSkill, ScheduleDay } from '../types/smartSchedule.types';
import { buildDefaultTemplate, validateSchedule, SCHEDULE_POLICY } from './scheduleRules';
import {
  preferredRunningDays,
  validateRunningWeek,
  runningCriticalityOrder,
  type RunningWeekDay,
  type RunningWeekContext,
  type RunningCriticalityContext,
} from './runningRules';

// ──────────────────────────────────────────────────────────────────────────
// Shared interface
// ──────────────────────────────────────────────────────────────────────────

export type RuleFamilyViolationSeverity = 'ERROR' | 'WARN';

export interface RuleFamilyViolation {
  code: string;
  severity: RuleFamilyViolationSeverity;
  message: string;
  affectedDays: number[];
}

export interface RuleFamilyValidation {
  valid: boolean;
  violations: RuleFamilyViolation[];
}

export interface RuleFamilyReduction<TWeek> {
  week: TWeek;
  /** Human-readable description of what changed vs. the previous week — for the coach-notes area. */
  removed: string[];
  notes: string[];
}

export interface RuleFamily<TWeek, TValidateContext, TReduceContext> {
  id: string;
  preferredDays(count: number): number[];
  validate(week: TWeek, context: TValidateContext): RuleFamilyValidation;
  reduceTo(week: TWeek, targetDayCount: number, context: TReduceContext): RuleFamilyReduction<TWeek>;
}

const DAY_NAMES_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function invalidWeekViolation(code: string, length: number): RuleFamilyValidation {
  return {
    valid: false,
    violations: [{
      code,
      severity: 'ERROR',
      message: `שבוע חייב להכיל 7 ימים, התקבלו ${length}.`,
      affectedDays: [],
    }],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Strength adapter — wraps scheduleRules.ts
// ──────────────────────────────────────────────────────────────────────────

/** No context needed — validateSchedule takes only the week. Present so the shape matches the shared interface. */
export type StrengthValidateContext = Record<string, never>;

export interface StrengthReduceContext {
  programs: ProgramId[];
  skills: PrioritizedSkill[];
}

/**
 * scheduleRules.ts's own day-preference table (SCHEDULE_POLICY.PREFERRED_DAYS)
 * is exported; the small fallback wrapper around it (for counts not in the
 * table) is NOT exported, so it's reproduced here rather than exported from
 * the source file — same fallback shape (count<=1 → [0]; otherwise
 * 0..min(count,6)), reading from the same shared policy data, not a
 * separate hardcoded table.
 */
function strengthPreferredDays(count: number): number[] {
  const lookup = SCHEDULE_POLICY.PREFERRED_DAYS as Record<number, number[]>;
  if (lookup[count]) return [...lookup[count]];
  if (count <= 1) return [0];
  return Array.from({ length: Math.min(count, 6) }, (_, i) => i);
}

function strengthValidate(week: ScheduleDay[]): RuleFamilyValidation {
  if (week.length !== 7) return invalidWeekViolation('STRENGTH-INVALID-WEEK', week.length);
  const warnings = validateSchedule(week);
  const violations: RuleFamilyViolation[] = warnings.map((w) => ({
    code: w.code,
    severity: w.level,
    message: w.message,
    affectedDays: w.affectedDays,
  }));
  return { valid: !violations.some((v) => v.severity === 'ERROR'), violations };
}

function describeDaySessions(day: ScheduleDay | undefined): string {
  if (!day || day.sessions.length === 0) return 'מנוחה';
  return day.sessions.map((s) => s.skillId).join('+');
}

/**
 * Strength doesn't remove sessions from an existing week — it rebuilds a
 * fresh template for targetDayCount via the untouched buildDefaultTemplate,
 * per CLAUDE.md's own framing: a week of N days isn't "N+1 minus one."
 * `removed` is a day-by-day diff against the previous week, for the
 * coach-notes area — not a literal "days removed" list, since
 * buildDefaultTemplate's own day-selection can shift which specific days of
 * the week are used (the PULL+PULL 3-day special case already picks
 * 0/2/5, not a subset of the 4-day case's days — this isn't new behavior,
 * just the first place it needs to be explained to a user).
 */
function strengthReduceTo(
  week: ScheduleDay[],
  targetDayCount: number,
  context: StrengthReduceContext,
): RuleFamilyReduction<ScheduleDay[]> {
  const rebuilt = buildDefaultTemplate(context.programs, context.skills, targetDayCount);
  const removed: string[] = [];

  for (let i = 0; i < 7; i++) {
    const before = describeDaySessions(week[i]);
    const after = describeDaySessions(rebuilt[i]);
    if (before !== after) {
      removed.push(`יום ${DAY_NAMES_HE[i]}: ${before} ← ${after}`);
    }
  }

  const notes: string[] =
    removed.length > 0
      ? ['הנפח השבועי הכולל יורד — פחות ימי אימון, כל אימון נשאר באותה עצימות.']
      : [];

  return { week: rebuilt, removed, notes };
}

export const strengthRuleFamily: RuleFamily<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
  id: 'strength',
  preferredDays: strengthPreferredDays,
  validate: strengthValidate,
  reduceTo: strengthReduceTo,
};

// ──────────────────────────────────────────────────────────────────────────
// Running adapter — wraps runningRules.ts
// ──────────────────────────────────────────────────────────────────────────

export type RunningReduceContext = RunningCriticalityContext;

// No invalid-week guard here — validateRunningWeek already returns its own
// RUN-INVALID-WEEK violation for a non-7-day week (confirmed by test: the
// adapter-level guard was temporarily disabled and the malformed-week tests
// still passed on the running side, unlike the strength side). The
// contract relies on each family's own validator when it already provides
// one; the adapter only adds the guard where the wrapped function is
// missing it (strength's validateSchedule returns [] silently instead).
function runningValidate(week: RunningWeekDay[], context: RunningWeekContext): RuleFamilyValidation {
  const result = validateRunningWeek(week, context);
  return {
    valid: result.valid,
    violations: result.violations.map((v) => ({
      code: v.code,
      severity: v.severity,
      message: v.message,
      affectedDays: v.affectedDays,
    })),
  };
}

/**
 * Drops the least-critical role first (runningCriticalityOrder), one day at
 * a time, until targetDayCount is reached. Never touches the remaining
 * days' roles — no compensating a dropped day by extending another, which
 * would trigger RUN-08 (the single-session distance jump guard) on the
 * remaining sessions. The note says explicitly that weekly mileage drops.
 */
function runningReduceTo(
  week: RunningWeekDay[],
  targetDayCount: number,
  context: RunningReduceContext,
): RuleFamilyReduction<RunningWeekDay[]> {
  const result = week.map((d) => ({ ...d }));
  const currentCount = result.filter((d) => d.role !== null).length;
  let remaining = currentCount - targetDayCount;

  if (remaining <= 0) {
    return { week: result, removed: [], notes: [] };
  }

  const dropOrder = runningCriticalityOrder(context);
  const removed: string[] = [];

  for (const role of dropOrder) {
    if (remaining <= 0) break;
    for (const day of result) {
      if (remaining <= 0) break;
      if (day.role === role) {
        removed.push(`יום ${DAY_NAMES_HE[day.dayOfWeek]}: ${role} הוסר`);
        day.role = null;
        remaining--;
      }
    }
  }

  const notes: string[] =
    removed.length > 0
      ? ['הקילומטראז׳ השבועי יורד — האימונים שנשארו לא מתארכים כפיצוי.']
      : [];

  return { week: result, removed, notes };
}

export const runningRuleFamily: RuleFamily<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
  id: 'running',
  preferredDays: preferredRunningDays,
  validate: runningValidate,
  reduceTo: runningReduceTo,
};
