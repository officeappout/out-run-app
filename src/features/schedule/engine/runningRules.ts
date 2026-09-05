/**
 * Running Rule Family — Rule Engine (run-to-run)
 *
 * Pure functions, zero React imports, zero engine imports. Standalone —
 * not wired to any consumer yet (that's a separate step). Mirrors
 * scheduleRules.ts's shape (function-per-rule, Warning-style violation
 * objects, plain string rule codes) so the future weaver
 * (.claude/knowledge/schedule-weaver-spec.md) can consume both families
 * through a uniform interface.
 *
 * Source of truth: .claude/knowledge/running-rule-family.md
 * Scope: rules between running workouts and themselves. Run-vs-strength
 * rules (R1-R8) live in running-strength-weekly-research.md — not
 * duplicated here.
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
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type RunningExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Mirrors running.types.ts's WeekSlot.slotType vocabulary (quality_primary /
 * quality_secondary / long_run / easy_run / recovery) by value, not by
 * import — this module stands alone, per its brief. Reusing the exact same
 * literal strings (rather than inventing near-duplicate names) is
 * deliberate: this codebase has already hit the "two vocabularies for the
 * same concept" bug more than once (running category labels, hill-category
 * constants) and this avoids adding a new instance of it.
 */
export type RunningDayRole =
  | 'quality_primary'
  | 'quality_secondary'
  | 'long_run'
  | 'easy_run'
  | 'recovery';

export interface RunningWeekDay {
  /** 0 = Sunday .. 6 = Saturday. Linear, no Saturday→Sunday wraparound —
   *  matches scheduleRules.ts's own WARN_01/WARN_02 convention. */
  dayOfWeek: number;
  /** null = rest day. */
  role: RunningDayRole | null;
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
// 2. validateRunningWeek — RUN-01, RUN-02, RUN-04
// ──────────────────────────────────────────────────────────────────────────

function isQualityRole(role: RunningDayRole | null): boolean {
  return role === 'quality_primary' || role === 'quality_secondary';
}

/**
 * Full-week validator for the running family. Checks:
 *   RUN-01 (ERROR) — two quality workouts on adjacent days (<48h apart).
 *   RUN-02 (WARN)  — the long run placed the day right after a quality
 *                    workout. A preference, never blocks (per the doc:
 *                    "אם אין פתרון חוקי אחר — מותר, עם הערה").
 *   RUN-04 (ERROR) — a run of consecutive training days exceeding the
 *                    level's cap (beginner 2 / intermediate 3 / advanced 4).
 * RUN-03 (easy is a buffer) has no dedicated check — it's the absence of a
 * RUN-01 hit when the neighboring role is 'easy_run', already covered by
 * RUN-01's own logic (only quality-vs-quality adjacency is flagged).
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
    if (isQualityRole(sorted[i].role) && isQualityRole(sorted[i + 1].role)) {
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
    if (isQualityRole(sorted[i].role) && sorted[i + 1].role === 'long_run') {
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
    if (sorted[i].role !== null) {
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
