/**
 * Running Rule Family — Rule Engine (run-to-run)
 *
 * Pure functions, zero React imports, zero engine imports. Wired to the
 * weaver via ruleFamily.ts and consumed by crossDomainRules.ts too.
 * Mirrors scheduleRules.ts's shape (function-per-rule, Warning-style
 * violation objects, plain string rule codes).
 *
 * Source of truth: .claude/knowledge/running-rule-family.md
 * Scope: rules between running workouts and themselves. Run-vs-strength
 * rules (R1-R8) live in running-strength-weekly-research.md — not
 * duplicated here.
 *
 * ── Shape unification (06.09.2026) ──
 * RunningWeekDay used to carry only `role` — a WeekSlot.slotType-derived
 * abstraction invented for this file's own use. That field never survived
 * into the real persisted schedule (ActiveRunningProgram.schedule[] only
 * had category/isQualityWorkout until commit 9b5cf7c7 added the real
 * slotType field) — meaning this whole file was written against a shape the
 * system never actually remembered. crossDomainRules.ts was built directly
 * against the real persisted fields (category/isQualityWorkout) instead,
 * which created two incompatible running-day shapes. This file now imports
 * WorkoutCategory from running.types.ts (a deliberate departure from
 * "stands alone" — the same departure crossDomainRules.ts already made, for
 * the same reason: you can't validate real data through a shape the real
 * data doesn't have) and RunningWeekDay carries
 * category/isQualityWorkout/slotType together, one shape, read by both this
 * file and crossDomainRules.ts.
 *
 * ── Naming unification (05.09.2026) ──
 * The field itself was also renamed, from `role` to `slotType` — matching
 * commit 9b5cf7c7's persisted field name exactly, so the concept has one
 * name end to end (Firestore field → this type → this file's functions),
 * not two. Pure rename, no behavior change: `matchesRoleForDrop` became
 * `matchesSlotTypeForDrop`, `RoleMatchResult`/`roleWasUnknown` became
 * `SlotTypeMatchResult`/`slotTypeWasUnknown`. `slotType` is optional and
 * authoritative when present; category/isQualityWorkout are the fallback
 * when it's absent (every schedule entry written before 06.09.2026 has no
 * slotType at all).
 *
 * Implements:
 *   - preferredRunningDays    (candidate day-set generator, RUN-01–RUN-04)
 *   - validateRunningWeek     (RUN-01, RUN-02, RUN-04)
 *   - runningCriticalityOrder (RUN-05, drop order by target distance)
 *   - checkSingleSessionSpike (RUN-08, single-session distance jump guard)
 *
 * Not implemented here, by the source doc's own instruction:
 *   - RUN-03 (easy is a buffer) has no violation mode of its own — it's the
 *     absence of a RUN-01/RUN-02 hit when the adjacent day is 'easy_run'.
 *     Covered by validateRunningWeek's tests, not a separate function.
 *   - RUN-06 (day-set gate) is the workflow of chaining
 *     preferredRunningDays → validateRunningWeek — not a third function.
 *   - RUN-07 (80/20 intensity split) explicitly preserves the existing
 *     mechanism ("אין לשנות") — no new code, nothing to test here.
 *
 * ── Not wired to production, on purpose ──
 * This module is intentionally not connected to a production consumer.
 * ActiveRunningProgram.schedule[]'s real `slotType` field (commit 9b5cf7c7)
 * and this file's `RunningWeekDay.slotType` are the same name now, but
 * nothing today reads the former and constructs the latter — confirmed by
 * repo-wide search: RunningWeekDay is referenced only inside
 * src/features/schedule/engine/ itself and its own tests. That bridge is
 * the drawer layer's job (the schedule-builder-drawer plan), which is the
 * intended caller of this whole rule-family module. Do not delete this file
 * (or ruleFamily.ts / crossDomainRules.ts / scheduleWeaver.ts) in an
 * unused-code cleanup pass on the strength of "zero production callers" —
 * that absence is the current, expected state, not evidence of dead code.
 */

import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type RunningExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Mirrors running.types.ts's WeekSlot.slotType vocabulary (quality_primary /
 * quality_secondary / long_run / easy_run / recovery) by value — this is
 * now literally the persisted schedule's own `slotType` field (commit
 * 9b5cf7c7), not an invented parallel name.
 */
export type RunningDayRole =
  | 'quality_primary'
  | 'quality_secondary'
  | 'long_run'
  | 'easy_run'
  | 'recovery';

/**
 * The unified running-day shape (06.09.2026) — read by this file AND
 * crossDomainRules.ts, one object, no conversion between them.
 *
 * `category` is the source of truth for whether the day trains at all
 * (null = rest day) and is reliably present for every user, old and new.
 * `isQualityWorkout` and `slotType` are both optional and both undefined
 * for every schedule entry written before their respective fixes
 * (890c03c7, 9b5cf7c7) — undefined must never be read as
 * false/absent-of-meaning, only as "not recorded."
 *
 * Precedence when they disagree: `slotType`, when present, is authoritative
 * — it carries the real WeekSlot the workout was generated for, including
 * the quality_primary/quality_secondary distinction that category +
 * isQualityWorkout cannot express (that split was never carried into
 * category — see running.types.ts's own doc comment on slotType). When
 * `slotType` is absent, `isQualityWorkout` (if present) decides quality;
 * failing that, category's own CATEGORY_IS_QUALITY mapping decides.
 */
export interface RunningWeekDay {
  /** 0 = Sunday .. 6 = Saturday. Linear, no Saturday→Sunday wraparound —
   *  matches scheduleRules.ts's own WARN_01/WARN_02 convention. */
  dayOfWeek: number;
  /** null = rest day (no running workout scheduled). Source of truth for "does this day train." */
  category: WorkoutCategory | null;
  /** Present only for schedule entries written after commit 890c03c7. */
  isQualityWorkout?: boolean;
  /** Present only for schedule entries written after commit 9b5cf7c7. Same
   *  field, same name, as ActiveRunningProgram.schedule[].slotType —
   *  authoritative over category/isQualityWorkout when present. */
  slotType?: RunningDayRole;
}

export interface RunningWeekContext {
  level: RunningExperienceLevel;
}

export type RunningRuleSeverity = 'ERROR' | 'WARN';

export interface RunningRuleViolation {
  /** e.g. 'RUN-01' — matches running-rule-family.md's rule codes. */
  code: string;
  severity: RunningRuleSeverity;
  /** Short Hebrew explanation for the coach-notes area. */
  message: string;
  affectedDays: number[];
}

export interface RunningWeekValidation {
  valid: boolean;
  violations: RunningRuleViolation[];
}

export interface RunningCriticalityContext {
  targetDistanceKm: number;
}

export type SessionSpikeLevel = 'none' | 'flagged' | 'explained' | 'blocked' | 'no-baseline';

// ──────────────────────────────────────────────────────────────────────────
// 1. preferredRunningDays — RUN-01–RUN-04
// ──────────────────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_TRAINING_DAYS: Record<RunningExperienceLevel, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
};

/**
 * Splits `count` training days across a 7-day week (0=Sunday..6=Saturday,
 * linear) by spreading the *rest* days as evenly as possible, using them as
 * separators that split the training days into (restCount + 1) balanced
 * segments. This minimizes the longest run of consecutive training days for
 * the given count — the best achievable spread for that count, full stop.
 *
 * Explicitly NOT a copy of getSmartDefaultDays' old table, which returned
 * [1,2,4,5] for 4 days/week — two adjacent pairs with day 3 (Wed) and days
 * 6 (Sat) left unused. This function instead produces {0,2,4,6} for the
 * same count: zero adjacent days, using the whole week.
 *
 * Level-agnostic on purpose (no `level` parameter): for a fixed `count`,
 * minimizing the longest run is the correct spacing strategy regardless of
 * who it's for — a lower RUN-04 cap only changes whether the *result*
 * happens to already satisfy it, never how the days should be arranged.
 *
 * This function does NOT guarantee the result is valid for every level —
 * it has no way to know the level, and even if it did, some (count, level)
 * combinations are mathematically infeasible (e.g. 6 days/week for a
 * beginner — impossible to keep every run ≤2 with only 1 rest day to split
 * 6 training days). It returns the best possible spread regardless. The
 * caller MUST run validateRunningWeek before treating the result as final,
 * per RUN-06 ("סט ימים אינו מאושר לפני שנבדק") and the weaver's own
 * "propose and verify" loop (schedule-weaver-spec.md).
 */
export function preferredRunningDays(count: number): number[] {
  const total = 7;
  const c = Math.max(0, Math.min(total, Math.round(count)));
  if (c === 0) return [];
  if (c === total) return Array.from({ length: total }, (_, i) => i);

  const restCount = total - c;
  const numSegments = restCount + 1;
  const baseSize = Math.floor(c / numSegments);
  const remainder = c % numSegments;

  const days: number[] = [];
  let cursor = 0;
  for (let seg = 0; seg < numSegments; seg++) {
    const segSize = seg < remainder ? baseSize + 1 : baseSize;
    for (let k = 0; k < segSize; k++) {
      days.push(cursor);
      cursor++;
    }
    if (seg < numSegments - 1) cursor++; // one rest day between segments
  }
  return days;
}

// ──────────────────────────────────────────────────────────────────────────
// Shape-aware derivation — slotType authoritative when present, category/
// isQualityWorkout the fallback when it's not.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Category → quality mapping, the fallback used whenever `slotType` is
 * absent (every schedule entry written before commit 9b5cf7c7). Typed as a
 * full Record so the compiler forces coverage of exactly the 11 real
 * categories.
 */
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

/** true = day trains at all (category !== null). This is the ONLY correct way to check "is this a training day" — slotType is optional and may be absent even for a real training day. */
export function isTrainingDay(day: RunningWeekDay): boolean {
  return day.category !== null;
}

/**
 * slotType, when present, is authoritative (it's the only field that can
 * express quality_primary vs quality_secondary). When absent: isQualityWorkout
 * if present, else category's CATEGORY_IS_QUALITY mapping. undefined is
 * never read as false at any step.
 */
export function isQualityDay(day: RunningWeekDay): boolean {
  if (day.category === null) return false;
  if (day.slotType !== undefined) return day.slotType === 'quality_primary' || day.slotType === 'quality_secondary';
  if (day.isQualityWorkout !== undefined) return day.isQualityWorkout;
  return CATEGORY_IS_QUALITY[day.category];
}

/** slotType, when present, is authoritative; otherwise category === 'long_run' — unambiguous either way, no fallback ambiguity here (unlike quality_primary/secondary). */
export function isLongRunDay(day: RunningWeekDay): boolean {
  if (day.category === null) return false;
  if (day.slotType !== undefined) return day.slotType === 'long_run';
  return day.category === 'long_run';
}

// ──────────────────────────────────────────────────────────────────────────
// 2. validateRunningWeek — RUN-01, RUN-02, RUN-04
// ──────────────────────────────────────────────────────────────────────────

/**
 * Full-week validator for the running family. Checks:
 *   RUN-01 (ERROR) — two quality workouts on adjacent days (<48h apart).
 *   RUN-02 (WARN)  — the long run placed the day right after a quality
 *                    workout. A preference, never blocks (per the doc:
 *                    "אם אין פתרון חוקי אחר — מותר, עם הערה").
 *   RUN-04 (ERROR) — a run of consecutive training days exceeding the
 *                    level's cap (beginner 2 / intermediate 3 / advanced 4).
 * RUN-03 (easy is a buffer) has no dedicated check — it's the absence of a
 * RUN-01 hit when the neighboring day isn't quality, already covered by
 * RUN-01's own logic (only quality-vs-quality adjacency is flagged).
 *
 * None of these three checks ever needs the quality_primary/secondary
 * distinction — isQualityDay treats both identically, same as before this
 * shape unification. Only RUN-05 (runningCriticalityOrder / the reduceTo
 * consumer in ruleFamily.ts) actually needs that split, and only when
 * dropping a day.
 *
 * `valid` is false only when at least one ERROR-level violation exists —
 * WARN-level (RUN-02) never flips it.
 */
export function validateRunningWeek(
  week: RunningWeekDay[],
  context: RunningWeekContext,
): RunningWeekValidation {
  if (week.length !== 7) {
    return {
      valid: false,
      violations: [{
        code: 'RUN-INVALID-WEEK',
        severity: 'ERROR',
        message: `שבוע חייב להכיל 7 ימים, התקבלו ${week.length}.`,
        affectedDays: [],
      }],
    };
  }

  const violations: RunningRuleViolation[] = [];
  const sorted = [...week].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  // RUN-01 — minimum 48h between quality workouts (hard).
  for (let i = 0; i < 6; i++) {
    if (isQualityDay(sorted[i]) && isQualityDay(sorted[i + 1])) {
      violations.push({
        code: 'RUN-01',
        severity: 'ERROR',
        message: 'שני אימוני איכות ביום עוקב — נדרשות לפחות 48 שעות ביניהם.',
        affectedDays: [sorted[i].dayOfWeek, sorted[i + 1].dayOfWeek],
      });
    }
  }

  // RUN-02 — avoid the long run right after a quality workout (soft).
  for (let i = 0; i < 6; i++) {
    if (isQualityDay(sorted[i]) && isLongRunDay(sorted[i + 1])) {
      violations.push({
        code: 'RUN-02',
        severity: 'WARN',
        message: 'ריצה ארוכה מיד אחרי אימון איכות — עדיף יום מנוחה או קל ביניהם.',
        affectedDays: [sorted[i].dayOfWeek, sorted[i + 1].dayOfWeek],
      });
    }
  }

  // RUN-04 — max consecutive training days by level.
  const maxConsecutive = MAX_CONSECUTIVE_TRAINING_DAYS[context.level];
  let streak: number[] = [];
  const flushStreak = () => {
    if (streak.length > maxConsecutive) {
      violations.push({
        code: 'RUN-04',
        severity: 'ERROR',
        message: `${streak.length} ימי ריצה רצופים — המקסימום ברמה זו הוא ${maxConsecutive}.`,
        affectedDays: [...streak],
      });
    }
    streak = [];
  };
  for (let i = 0; i < 7; i++) {
    if (isTrainingDay(sorted[i])) {
      streak.push(sorted[i].dayOfWeek);
    } else {
      flushStreak();
    }
  }
  flushStreak(); // trailing streak at end of week

  const valid = !violations.some((v) => v.severity === 'ERROR');
  return { valid, violations };
}

// ──────────────────────────────────────────────────────────────────────────
// 3. runningCriticalityOrder — RUN-05
// ──────────────────────────────────────────────────────────────────────────

const SHORT_DISTANCE_DROP_ORDER: RunningDayRole[] = [
  'easy_run', 'long_run', 'quality_secondary', 'quality_primary',
];
const LONG_DISTANCE_DROP_ORDER: RunningDayRole[] = [
  'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
];
const SHORT_DISTANCE_THRESHOLD_KM = 5;

/**
 * RUN-05 — criticality drop order, by target distance.
 *
 * Boundary is 5km, not 10km: ≤5km ("short") uses one order, above 5km
 * ("long") uses the other — the doc no longer leaves a 5–10km gap
 * undefined (running-rule-family.md, updated 05.09.2026). Reason for the
 * flip: an 8K target already leans on a real long run as its backbone the
 * same way a 10K does, unlike a 5K where speed/quality dominates.
 */
export function runningCriticalityOrder(context: RunningCriticalityContext): RunningDayRole[] {
  return context.targetDistanceKm <= SHORT_DISTANCE_THRESHOLD_KM
    ? [...SHORT_DISTANCE_DROP_ORDER]
    : [...LONG_DISTANCE_DROP_ORDER];
}

export interface SlotTypeMatchResult {
  matches: boolean;
  /** true when this determination required the fallback below because
   *  slotType was absent — a stand-in for the real distinction, not the
   *  real thing. Always false when slotType was present (exact match,
   *  authoritative). */
  slotTypeWasUnknown: boolean;
}

/**
 * Matches a day against one entry of runningCriticalityOrder's drop
 * sequence — the only place the quality_primary/quality_secondary split
 * actually gets consumed (RUN-05's real use, inside ruleFamily.ts's
 * runningReduceTo).
 *
 * When `day.slotType` is present, this is an exact match — authoritative,
 * slotTypeWasUnknown always false.
 *
 * When absent, this is a FALLBACK, not a rule: long_run and easy_run are
 * unambiguously derivable from category (isLongRunDay / !isQualityDay),
 * but quality_primary vs quality_secondary is NOT — that split was never
 * carried into category+isQualityWorkout, only into slotType. So an
 * unknown-slotType quality day is treated as matching EITHER quality tier
 * (deterministically resolved by whichever tier the caller's drop-order
 * iteration reaches first — see runningReduceTo), and slotTypeWasUnknown is
 * set so the caller can say so explicitly rather than silently pretending
 * the distinction was real.
 */
export function matchesSlotTypeForDrop(day: RunningWeekDay, targetSlotType: RunningDayRole): SlotTypeMatchResult {
  if (day.slotType !== undefined) {
    return { matches: day.slotType === targetSlotType, slotTypeWasUnknown: false };
  }
  if (day.category === null) return { matches: false, slotTypeWasUnknown: false };
  if (isLongRunDay(day)) return { matches: targetSlotType === 'long_run', slotTypeWasUnknown: false };
  if (isQualityDay(day)) {
    const matches = targetSlotType === 'quality_primary' || targetSlotType === 'quality_secondary';
    return { matches, slotTypeWasUnknown: matches };
  }
  return { matches: targetSlotType === 'easy_run', slotTypeWasUnknown: false };
}

// ──────────────────────────────────────────────────────────────────────────
// 4. checkSingleSessionSpike — RUN-08
// ──────────────────────────────────────────────────────────────────────────

const SPIKE_FLAGGED_PERCENT = 10;
const SPIKE_EXPLAINED_PERCENT = 30;
const SPIKE_BLOCKED_PERCENT = 100;

/**
 * RUN-08 — single-session distance jump guard. The only rule in this family
 * backed by quantitative data (BJSM 2025 cohort study, 5,205 runners):
 * exceeding the last-30-days longest run by more than 10% is associated
 * with a 52%-128% injury-risk increase, scaling with overshoot size.
 *
 * Reports only — never decides. 'blocked' means "requires explicit user
 * confirmation before entering the schedule," not "rejected automatically"
 * (per the doc: "המודול רק מדווח, לא מחליט").
 *
 * `longestInLast30DaysKm <= 0` (no running history yet, e.g. a brand-new
 * runner) → 'no-baseline', not 'none'. These are not the same claim: 'none'
 * means "checked, no elevated risk"; 'no-baseline' means "nothing to check
 * against." A brand-new runner is exactly the case that must never read as
 * cleared — collapsing it into 'none' would tell a caller "this planned
 * distance is safe" when in fact safety was never assessed at all. Not
 * stated in the source doc; this is my own resolution of an unstated edge
 * case (avoiding a divide-by-zero), not an invented threshold value.
 */
export function checkSingleSessionSpike(
  plannedDistanceKm: number,
  longestInLast30DaysKm: number,
): SessionSpikeLevel {
  if (longestInLast30DaysKm <= 0) return 'no-baseline';
  const overshootPercent =
    ((plannedDistanceKm - longestInLast30DaysKm) / longestInLast30DaysKm) * 100;
  if (overshootPercent < SPIKE_FLAGGED_PERCENT) return 'none';
  if (overshootPercent < SPIKE_EXPLAINED_PERCENT) return 'flagged';
  if (overshootPercent < SPIKE_BLOCKED_PERCENT) return 'explained';
  return 'blocked';
}
