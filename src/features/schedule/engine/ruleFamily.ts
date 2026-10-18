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
import { buildDefaultTemplate, validateSchedule, preferredDays } from './scheduleRules';
import { scheduleIdNameHe } from './strengthVocabulary';
import {
  preferredRunningDays,
  validateRunningWeek,
  runningCriticalityOrder,
  matchesSlotTypeForDrop,
  isTrainingDay,
  RUNNING_SLOT_NAME_HE,
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
  /**
   * Places the same trainings from `week` onto `dayIndices` instead,
   * preserving order. Returns null if this domain cannot be placed on that
   * exact day set. Each family implements this itself — the weaver never
   * places days on a domain's behalf, since placement can require content
   * knowledge (which day-sets a domain's own construction logic can even
   * produce).
   */
  placeOn(week: TWeek, dayIndices: number[], context: TReduceContext): TWeek | null;
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

// scheduleRules.ts's `preferredDays` used to be reproduced here by hand (it
// wasn't exported from the source file). That's exactly the shape of bug
// that let the zero-days fallback (`daysPerWeek<=1 -> [0]`) get fixed in one
// copy and left broken in the other — now exported and imported directly
// instead, so there's only one body to ever be wrong.

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
  return day.sessions.map((s) => scheduleIdNameHe(s.skillId)).join(' + ');
}

// ── Strength content helpers (schedule advisor phase A, bug #4) ─────────────

function cloneDay(day: ScheduleDay, dayOfWeek: number): ScheduleDay {
  return {
    dayOfWeek: dayOfWeek as ScheduleDay['dayOfWeek'],
    sessions: day.sessions.map((s) => ({ ...s })),
    isRestDay: day.sessions.length === 0,
    warnings: [],
  };
}

function emptyStrengthDay(dayOfWeek: number): ScheduleDay {
  return { dayOfWeek: dayOfWeek as ScheduleDay['dayOfWeek'], sessions: [], isRestDay: true, warnings: [] };
}

/** The week's training days, in day order (the content placeOn relabels). */
function trainingDaysInOrder(week: ScheduleDay[]): ScheduleDay[] {
  return [...week].sort((a, b) => a.dayOfWeek - b.dayOfWeek).filter((d) => d.sessions.length > 0);
}

function contentKey(day: ScheduleDay): string {
  return day.sessions.map((s) => `${s.skillId}:${s.sessionType}`).join('+');
}

/**
 * The week's own training content resized to `count` days, never invented:
 *   - fewer days: keep one of every distinct day-content first (a legs day is not dropped
 *     before a second identical upper day), then the rest in day order; dropped from the
 *     end of the week first.
 *   - more days: repeat the week's own content in order (cycle) — how a 6-day template
 *     becomes a 7-day one.
 *   - an EMPTY base (no content to resize) falls back to buildDefaultTemplate's own
 *     content for that count — the seed path the weaver already used.
 */
function resizeStrengthContent(week: ScheduleDay[], count: number, context: StrengthReduceContext): ScheduleDay[] {
  if (count <= 0) return [];
  let content = trainingDaysInOrder(week);
  if (content.length === 0) {
    content = trainingDaysInOrder(buildDefaultTemplate(context.programs, context.skills, Math.min(count, 6)));
    if (content.length === 0) return [];
  }
  if (content.length === count) return content;
  if (content.length > count) {
    const seen = new Set<string>();
    const keep = new Set<number>();
    content.forEach((d, i) => {
      const k = contentKey(d);
      if (!seen.has(k) && keep.size < count) {
        seen.add(k);
        keep.add(i);
      }
    });
    for (let i = 0; i < content.length && keep.size < count; i++) keep.add(i);
    return content.filter((_, i) => keep.has(i));
  }
  const out: ScheduleDay[] = [];
  for (let i = 0; i < count; i++) out.push(content[i % content.length]);
  return out;
}

/** validateSchedule codes that mean "this placement is physically worse" (fatigue / spacing). */
const STRENGTH_PLACEMENT_FATIGUE_CODES = new Set(['WARN_01', 'WARN_02', 'WARN_03', 'WARN_06', 'WARN_09', 'WARN_14']);

function fatigueProfile(week: ScheduleDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of validateSchedule(week)) {
    if (STRENGTH_PLACEMENT_FATIGUE_CODES.has(w.code)) m.set(w.code, (m.get(w.code) ?? 0) + 1);
  }
  return m;
}

/**
 * Strength reduces by resizing its OWN content (resizeStrengthContent), not by rebuilding
 * an unrelated default template: a push / pull / legs user keeps the legs day. The new
 * content lands on the domain's preferred days for the new count. `removed` is a
 * day-by-day diff against the previous week, for the coach-notes area.
 */
function strengthReduceTo(
  week: ScheduleDay[],
  targetDayCount: number,
  context: StrengthReduceContext,
): RuleFamilyReduction<ScheduleDay[]> {
  const content = resizeStrengthContent(week, targetDayCount, context);
  const days = strengthPreferredDays(content.length);
  const rebuilt: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => emptyStrengthDay(i));
  days.forEach((dow, idx) => {
    if (content[idx]) rebuilt[dow] = cloneDay(content[idx], dow);
  });
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

/**
 * Bug #4 (schedule advisor phase A): placeOn used to succeed only when the requested days
 * happened to equal buildDefaultTemplate's own PREFERRED_DAYS for that count, so strength
 * could never move (and 7 days was impossible). Now it relabels the week's own content
 * (resized to the requested count, see resizeStrengthContent) onto ANY day-set, in order,
 * and accepts it unless validateSchedule reports more fatigue / spacing findings
 * (STRENGTH_PLACEMENT_FATIGUE_CODES) than the same content on the domain's preferred days
 * — i.e. a placement may never be physically worse than the default one. Saturday
 * (WARN_15) is a note, never a block.
 */
function strengthPlaceOn(
  week: ScheduleDay[],
  dayIndices: number[],
  context: StrengthReduceContext,
): ScheduleDay[] | null {
  const requested = Array.from(new Set(dayIndices)).sort((a, b) => a - b);
  if (requested.length !== dayIndices.length || requested.some((d) => d < 0 || d > 6)) return null;
  if (requested.length === 0) return Array.from({ length: 7 }, (_, i) => emptyStrengthDay(i));

  const content = resizeStrengthContent(week, requested.length, context);
  if (content.length !== requested.length) return null;

  const placeAt = (days: number[]): ScheduleDay[] => {
    const out: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => emptyStrengthDay(i));
    days.forEach((dow, idx) => {
      out[dow] = cloneDay(content[idx], dow);
    });
    return out;
  };

  const placed = placeAt(requested);
  const baseline = fatigueProfile(placeAt(strengthPreferredDays(requested.length)));
  for (const [code, n] of Array.from(fatigueProfile(placed))) {
    if (n > (baseline.get(code) ?? 0)) return null;
  }
  return placed;
}

/** scheduleRules.preferredDays, plus a real 7-day answer (the wizard's own table stops at 6). */
function strengthPreferredDays(count: number): number[] {
  if (count >= 7) return [0, 1, 2, 3, 4, 5, 6];
  return preferredDays(count);
}

export const strengthRuleFamily: RuleFamily<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
  id: 'strength',
  preferredDays: strengthPreferredDays,
  validate: strengthValidate,
  reduceTo: strengthReduceTo,
  placeOn: strengthPlaceOn,
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
 * Drops the least-critical slotType first (runningCriticalityOrder), one
 * day at a time, until targetDayCount is reached. Never touches the
 * remaining days' content — no compensating a dropped day by extending
 * another, which would trigger RUN-08 (the single-session distance jump
 * guard) on the remaining sessions. The note says explicitly that weekly
 * mileage drops, plus a second note when the quality_primary/secondary
 * distinction had to be resolved by matchesSlotTypeForDrop's documented
 * fallback (see runningRules.ts) rather than a real per-day slotType.
 */
function runningReduceTo(
  week: RunningWeekDay[],
  targetDayCount: number,
  context: RunningReduceContext,
): RuleFamilyReduction<RunningWeekDay[]> {
  const result = week.map((d) => ({ ...d }));
  const currentCount = result.filter((d) => isTrainingDay(d)).length;
  let remaining = currentCount - targetDayCount;

  if (remaining <= 0) {
    return { week: result, removed: [], notes: [] };
  }

  const dropOrder = runningCriticalityOrder(context);
  const removed: string[] = [];
  let anySlotTypeUnknown = false;

  for (const slotType of dropOrder) {
    if (remaining <= 0) break;
    for (const day of result) {
      if (remaining <= 0) break;
      if (!isTrainingDay(day)) continue;
      const match = matchesSlotTypeForDrop(day, slotType);
      if (match.matches) {
        if (match.slotTypeWasUnknown) anySlotTypeUnknown = true;
        removed.push(`יום ${DAY_NAMES_HE[day.dayOfWeek]}: ${RUNNING_SLOT_NAME_HE[slotType]} הוסרה`);
        day.category = null;
        day.slotType = undefined;
        day.isQualityWorkout = undefined;
        remaining--;
      }
    }
  }

  const notes: string[] = [];
  if (removed.length > 0) {
    notes.push('הקילומטראז׳ השבועי יורד — האימונים שנשארו לא מתארכים כפיצוי.');
    if (anySlotTypeUnknown) {
      notes.push('התפקיד המדויק (איכות ראשית/משנית) לא היה ידוע לפחות ליום אחד שהוסר — ההסרה בוצעה לפי נפילה דטרמיניסטית, לא לפי הבחנה מדויקת.');
    }
  }

  return { week: result, removed, notes };
}

/**
 * Running's trainings carry no fixed day identity of their own, so
 * relocating them is pure relabeling: take the existing training-day
 * entries in day-order (full entries — category/isQualityWorkout/slotType
 * together, not just slotType) and lay them onto the new day-set in the
 * same order. Fails (null) only on a malformed request — duplicate/
 * out-of-range indices, or a day count that doesn't match how many
 * trainings currently exist to relocate.
 */
function runningPlaceOn(
  week: RunningWeekDay[],
  dayIndices: number[],
  _context: RunningReduceContext,
): RunningWeekDay[] | null {
  const requested = Array.from(new Set(dayIndices)).sort((a, b) => a - b);
  if (requested.length !== dayIndices.length || requested.some((d) => d < 0 || d > 6)) return null;

  const trainingEntries = [...week]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .filter((d) => isTrainingDay(d));
  if (trainingEntries.length !== requested.length) return null;

  const result: RunningWeekDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
  requested.forEach((dayOfWeek, idx) => {
    result[dayOfWeek] = { ...trainingEntries[idx], dayOfWeek };
  });
  return result;
}

export const runningRuleFamily: RuleFamily<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
  id: 'running',
  preferredDays: preferredRunningDays,
  validate: runningValidate,
  reduceTo: runningReduceTo,
  placeOn: runningPlaceOn,
};
