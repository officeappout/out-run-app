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
 * "Quality running workout" / "long run" derivation, and the running-day
 * shape itself (RunningWeekDay), are imported from runningRules.ts, not
 * redefined here (shape unification, 06.09.2026 — this file used to define
 * its own parallel CrossDomainRunningDay type; that's gone, one shape now,
 * read by both files). See runningRules.ts's own header for the full
 * "slotType authoritative when present, category/isQualityWorkout the
 * fallback" contract (the field was originally named `role`; renamed to
 * `slotType` 05.09.2026 to match ActiveRunningProgram.schedule[]'s real
 * persisted field name — one name for the concept, not two).
 *
 * ── Not wired to production, on purpose ──
 * Like runningRules.ts, this module is intentionally not connected to a
 * production consumer yet. The bridge between ActiveRunningProgram.schedule[]
 * and CrossDomainWeek/RunningWeekDay will be built in the drawer layer (the
 * schedule-builder-drawer plan), which is the intended caller. Do not delete
 * this file in an unused-code cleanup pass on the strength of "zero
 * production callers" — that's the current, expected state, not dead code.
 */

import type {
  RuleFamily,
  RuleFamilyValidation,
  RuleFamilyViolation,
} from './ruleFamily';
import type { ScheduleDay } from '../types/smartSchedule.types';
import {
  isQualityDay,
  isLongRunDay,
  isTrainingDay,
  type RunningWeekDay,
} from './runningRules';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface CrossDomainWeek {
  strength: ScheduleDay[];
  running: RunningWeekDay[];
  /**
   * dayOfWeek → order, for every day this candidate shares between the two
   * domains — decided via resolveDoubleDayOrder (R2), BEFORE this candidate
   * is validated (see R3's doc below). validateCrossDomain reads this; it
   * never computes order itself — R2 is a decision, not a validation (see
   * resolveDoubleDayOrder's own doc). A shared day missing from this map
   * defaults to 'strength-first' — the conservative assumption, since an
   * order that was never actually decided cannot be assumed safe. The
   * weaver always populates this for every shared day before calling
   * validate; a caller that skips it (e.g. an older test) gets the
   * pre-fix (unconditional-ban) behavior for that day by default.
   */
  sharedDayOrder?: Partial<Record<number, DoubleDayOrder>>;
}

export interface CrossDomainValidateContext {
  /**
   * R7's floor (WHO 2020: 2, `src/lib/who-strength-target.ts`'s
   * `WHO_STRENGTH_TARGET_DAYS` — a pure constant now, safe to import
   * directly; not the case when this comment was first written, when the
   * only copy lived in `weekly-load.service.ts`, a file with a top-level
   * `firebase/firestore` import). Still passed in by the caller rather than
   * imported here — this file decides nothing about WHO targets on its
   * own; the caller supplies whatever floor applies, and this file only
   * checks the candidate week against it.
   */
  minStrengthDaysPerWeek: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers (quality/long-run derivation itself lives in runningRules.ts)
// ──────────────────────────────────────────────────────────────────────────

function strengthHasSession(week: ScheduleDay[], dayOfWeek: number): boolean {
  return (week[dayOfWeek]?.sessions.length ?? 0) > 0;
}

function countStrengthDays(week: ScheduleDay[]): number {
  return week.reduce((acc, d) => acc + (d.sessions.length > 0 ? 1 : 0), 0);
}

function countRunningDays(week: RunningWeekDay[]): number {
  return week.reduce((acc, d) => acc + (isTrainingDay(d) ? 1 : 0), 0);
}

// ──────────────────────────────────────────────────────────────────────────
// resolveDoubleDayOrder — R2, a decision, not a validation
// ──────────────────────────────────────────────────────────────────────────

export type DoubleDayOrder = 'strength-first' | 'running-first';

export interface DoubleDayEntries {
  strength: ScheduleDay;
  running: RunningWeekDay;
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
  return isQualityDay(dayEntries.running) ? 'running-first' : 'strength-first';
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
 * R3 — a ban on ORDER, not on sharing the day. Source doc §2: "לעולם לא
 * כוח לפני ריצת איכות" ("never strength before a quality run") — the ban is
 * on strength going FIRST, not on the two ever landing on the same day.
 * Fixed (this file previously banned any quality-day sharing unconditionally
 * — proven wrong: if R3 forbade the day outright, R2/resolveDoubleDayOrder
 * would have nothing to decide, yet R2 exists in the source doc precisely
 * to choose an order for this exact case). ERROR only when the day's order
 * (from `week.sharedDayOrder`, decided before this function runs — see
 * that field's own doc) is 'strength-first'; a quality day ordered
 * 'running-first' is legal. Since resolveDoubleDayOrder's own logic always
 * recommends running-first for a quality day, a caller that follows the
 * recommendation (the weaver does) will never actually trigger R3 here —
 * this check exists to catch a candidate constructed with the WRONG order,
 * not to fire in the weaver's own correct-by-construction path.
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

    const quality = isQualityDay(runningDay!);
    const long = isLongRunDay(runningDay!);

    // R3 — a ban on order, not on sharing. See the doc above.
    if (quality) {
      const order = week.sharedDayOrder?.[dow] ?? 'strength-first';
      if (order === 'strength-first') {
        violations.push({
          code: 'R3',
          severity: 'ERROR',
          message: 'כוח לפני ריצת איכות באותו יום — אסור. הריצה חייבת לקדום.',
          affectedDays: [dow],
        });
      }
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
