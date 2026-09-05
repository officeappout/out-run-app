/**
 * Cross-Domain Rule Family — the pair (strength × running)
 *
 * Satisfies the same RuleFamily interface as the two domain families
 * (ruleFamily.ts), but its scope is the PAIR, not one domain. Source:
 * R1-R8 in .claude/knowledge/running-strength-weekly-research.md.
 *
 * Implements: R1, R3, R6 (first half), R7, R8 in validate(); R2 as a
 * separate decision function, resolveDoubleDayOrder (see below — R2 is a
 * decision the weaver needs, not a finding to fail a candidate on).
 * Deliberately NOT implemented (documented, not silently skipped):
 *   - R4 (no heavy-legs-day-before-quality/long-run) — there is no leg
 *     identifier anywhere in the strength type system (SkillId is all
 *     upper-body: PLANCHE/HSPU/FRONT_LEVER/OAPU/MUSCLE_UP/HANDSTAND;
 *     ProgramId has no lower-body value at all — confirmed by direct
 *     search, not assumed). Not blocked — not relevant yet. Revisit when
 *     a lower-body program/skill exists.
 *   - R6's second half (no heavy-legs-day-before-the-long-run) — same
 *     blocker as R4, since it needs the identical leg identifier.
 *   - R5 (double day lands on an already-hard day) — no day-level
 *     intensity/hardness concept exists on the strength side at all
 *     (grepped smartSchedule.types.ts: no intensity/hardness/load field).
 *
 * "Quality running workout" is derived from `category`, NOT
 * `isQualityWorkout`. `isQualityWorkout` is undefined for every schedule
 * entry written before commit 890c03c7 and has zero live readers today
 * (verified) — `category` predates that change and is reliably present
 * for every user, old and new. When isQualityWorkout IS present, it wins
 * (it's the more precise, per-workout signal); undefined is never read as
 * false, per running.types.ts's own contract on that field.
 */

import type {
  RuleFamily,
  RuleFamilyValidation,
  RuleFamilyViolation,
} from './ruleFamily';
import type { ScheduleDay } from '../types/smartSchedule.types';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface CrossDomainRunningDay {
  dayOfWeek: number;
  /** null = no running workout scheduled that day. */
  category: WorkoutCategory | null;
  /** Present only for schedule entries written after 890c03c7. Wins over the category-derived guess when present. */
  isQualityWorkout?: boolean;
}

export interface CrossDomainWeek {
  strength: ScheduleDay[];
  running: CrossDomainRunningDay[];
}

export interface CrossDomainValidateContext {
  /**
   * R7's floor (WHO 2020: 2). Passed in by the caller rather than imported
   * from weekly-load.service.ts's WHO_STRENGTH_TARGET_DAYS — that file does
   * live Firestore reads (getDocs), and this module must stay pure. The
   * caller decides the number; this file only checks the candidate week
   * against whatever floor it's given.
   */
  minStrengthDaysPerWeek: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Quality-workout derivation
// ──────────────────────────────────────────────────────────────────────────

const CATEGORY_IS_QUALITY: Record<WorkoutCategory, boolean> = {
  short_intervals: true,
  long_intervals: true,
  tempo: true,
  hill_long: true,
  hill_short: true,
  hill_sprints: true,
  fartlek_structured: true,
  easy_run: false,
  long_run: false,
  fartlek_easy: false,
  strides: false,
};

function isQualityRunningDay(day: CrossDomainRunningDay): boolean {
  if (day.category === null) return false;
  if (day.isQualityWorkout !== undefined) return day.isQualityWorkout;
  return CATEGORY_IS_QUALITY[day.category];
}

function isLongRunDay(day: CrossDomainRunningDay): boolean {
  return day.category === 'long_run';
}

function strengthHasSession(week: ScheduleDay[], dayOfWeek: number): boolean {
  return (week[dayOfWeek]?.sessions.length ?? 0) > 0;
}

function countStrengthDays(week: ScheduleDay[]): number {
  return week.reduce((acc, d) => acc + (d.sessions.length > 0 ? 1 : 0), 0);
}

function countRunningDays(week: CrossDomainRunningDay[]): number {
  return week.reduce((acc, d) => acc + (d.category !== null ? 1 : 0), 0);
}

// ──────────────────────────────────────────────────────────────────────────
// resolveDoubleDayOrder — R2, a decision, not a validation
// ──────────────────────────────────────────────────────────────────────────

export type DoubleDayOrder = 'strength-first' | 'running-first';

export interface DoubleDayEntries {
  strength: ScheduleDay;
  running: CrossDomainRunningDay;
}

/**
 * R2 is a DECISION the weaver needs when it places a double day (what order
 * to recommend), not a finding to fail a candidate on — it never
 * contributes a violation to validateCrossDomain. Strength goes first by
 * default; a quality running day flips it to running-first.
 *
 * `dayEntries.strength` is accepted for shape-symmetry with the pair this
 * decision is about, and to leave room for a future version of this
 * decision that reads strength content too — today only the running side
 * actually drives it.
 *
 * There is no time-of-day field on either domain's schedule to check
 * against (strengthTime is declared but never written by any live code;
 * runningTime is a single global preference, not per-day) — so this
 * function can never verify actual chronological order, only recommend
 * one. That caveat lives here, in the doc comment, not as a warning
 * surfaced to the user — the recommendation itself is what's shown.
 */
export function resolveDoubleDayOrder(
  dayEntries: DoubleDayEntries,
  _context: CrossDomainValidateContext,
): DoubleDayOrder {
  return isQualityRunningDay(dayEntries.running) ? 'running-first' : 'strength-first';
}

// ──────────────────────────────────────────────────────────────────────────
// validate
// ──────────────────────────────────────────────────────────────────────────

/**
 * R1 — a shared day is permitted on its own. There is no violation code for
 * R1 itself; it exists only so nothing else in this validator mistakes "two
 * domains, same day" for a problem by default. Tested by asserting a clean
 * shared day (nothing else wrong) produces zero violations.
 *
 * R3 — hard: since order can't be verified (see resolveDoubleDayOrder), a shared
 * day where the run is quality is not allowed at all, not just "risky if
 * misordered." ERROR, blocks valid.
 *
 * R6 (first half only) — hard, same reasoning: no strength session is
 * allowed on a day with the long run. ERROR, blocks valid. The doc calls R3
 * "the only hard rule" in its own §2 (order) discussion; R6 comes from a
 * different section (§3, protecting the long run) and is phrased with the
 * same unconditional language ("אין כוח באותו יום") — treated as ERROR here
 * for consistency with that phrasing, not because the doc says so
 * explicitly for R6. Flagging this as a judgment call, not a certainty.
 *
 * R7 — floor on total strength days in the candidate week. ERROR if under
 * context.minStrengthDaysPerWeek.
 *
 * R8 — when the candidate week's total workout count (strength days +
 * running days) is ≤4, at most one shared day is allowed. Counted from the
 * candidate week itself, never from stored/external data. ERROR if
 * exceeded — same consistency judgment call as R6, since the doc's own
 * wording here ("עדיפות להפרדה") is softer than R3's, but the actual limit
 * ("לכל היותר יום כפול אחד") reads as a firm cap.
 */
export function validateCrossDomain(
  week: CrossDomainWeek,
  context: CrossDomainValidateContext,
): RuleFamilyValidation {
  const violations: RuleFamilyViolation[] = [];

  for (let dow = 0; dow < 7; dow++) {
    const runningDay = week.running.find((d) => d.dayOfWeek === dow);
    const hasStrength = strengthHasSession(week.strength, dow);
    const hasRunning = !!runningDay && runningDay.category !== null;
    if (!hasStrength || !hasRunning) continue;

    const quality = isQualityRunningDay(runningDay!);
    const long = isLongRunDay(runningDay!);

    // R3 — hard: never strength + a quality run, same day.
    if (quality) {
      violations.push({
        code: 'R3',
        severity: 'ERROR',
        message: 'כוח וריצת איכות באותו יום — אסור, סדר לא ניתן לאימות.',
        affectedDays: [dow],
      });
    }

    // R6 (first half) — hard: never strength + the long run, same day.
    if (long) {
      violations.push({
        code: 'R6',
        severity: 'ERROR',
        message: 'כוח וריצה ארוכה באותו יום — הריצה הארוכה מוגנת.',
        affectedDays: [dow],
      });
    }
  }

  // R7 — floor on total strength days in the candidate week.
  const strengthDayCount = countStrengthDays(week.strength);
  if (strengthDayCount < context.minStrengthDaysPerWeek) {
    violations.push({
      code: 'R7',
      severity: 'ERROR',
      message: `${strengthDayCount} ימי כוח בשבוע — נדרשים לפחות ${context.minStrengthDaysPerWeek}.`,
      affectedDays: [],
    });
  }

  // R8 — with ≤4 total workouts, at most one shared day.
  const totalWorkouts = strengthDayCount + countRunningDays(week.running);
  if (totalWorkouts <= 4) {
    const sharedDays: number[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const runningDay = week.running.find((d) => d.dayOfWeek === dow);
      if (strengthHasSession(week.strength, dow) && runningDay?.category !== null && runningDay !== undefined) {
        sharedDays.push(dow);
      }
    }
    if (sharedDays.length > 1) {
      violations.push({
        code: 'R8',
        severity: 'ERROR',
        message: `${sharedDays.length} ימים משותפים בשבוע עם ${totalWorkouts} אימונים בסך הכל — מותר לכל היותר אחד.`,
        affectedDays: sharedDays,
      });
    }
  }

  const valid = !violations.some((v) => v.severity === 'ERROR');
  return { valid, violations };
}

// ──────────────────────────────────────────────────────────────────────────
// RuleFamily conformance
// ──────────────────────────────────────────────────────────────────────────

/**
 * preferredDays / reduceTo / placeOn are deliberately degenerate here — this
 * family has no day-selection concept of its own. It only judges what the
 * two domain families produce; it never proposes or relocates days by
 * itself. Implemented (not omitted) purely so the weaver can call all three
 * families through the exact same RuleFamily<...> shape.
 */
export const crossDomainRuleFamily: RuleFamily<CrossDomainWeek, CrossDomainValidateContext, Record<string, never>> = {
  id: 'cross-domain',
  preferredDays: () => [],
  validate: validateCrossDomain,
  reduceTo: (week) => ({ week, removed: [], notes: [] }),
  placeOn: () => null,
};
