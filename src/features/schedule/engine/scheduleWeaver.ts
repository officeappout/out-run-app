/**
 * Schedule Weaver — coordinates the strength, running, and cross-domain
 * rule families into one week.
 *
 * Unlike the two domain families, this file is NOT domain-agnostic — it
 * names strength and running directly, because it must call
 * crossDomainRules.ts's validateCrossDomain/resolveDoubleDayOrder, which are
 * themselves strength+running-specific (there is no generic N-domain cross
 * validator). A fully generic 2-domain weaver and a strength×running cross
 * validator can't both exist without one wrapping the other; this file is
 * the wrapper.
 *
 * Source of truth: .claude/knowledge/schedule-weaver-spec.md
 *
 * ── focus (0-100) drives dominance, not the final placement by itself ──
 * `focus < 50` → strength is dominant; otherwise running is dominant.
 * Dominance means: during the day-set search (see below), the dominant
 * domain's day-set is tried FIXED (at its own preferredDays) before the
 * weaver ever considers moving it. It does NOT mean the dominant domain is
 * protected from reduction — that's governed separately by R7's floor (see
 * "reduction" below), independent of focus.
 *
 * ── Design note: existingWeek is always real, never built from scratch ──
 * weaveWeek never synthesizes a domain's week from raw day-counts alone —
 * each domain input already carries a real `existingWeek` from its own
 * construction pathway (buildDefaultTemplate for strength, the running
 * engine's generatePlan for running). This file only relabels that content
 * onto different days (placeOn) or asks the domain to remove content
 * (reduceTo) — it never invents sessions/workouts itself.
 *
 * ── Day-set search, not day-count search ──
 * The previous version of this file only searched over (dominantCount,
 * secondaryCount) pairs, gated by a raw count-sum vs. availableDayCount
 * comparison — it never asked WHICH days, so it could not avoid two domains
 * unnecessarily landing on the identical day-set when there was room to
 * spread them out, and it double-counted a day that could host both
 * domains as needing two slots instead of one. Fixed here: availableDayCount
 * is now checked against the count of DISTINCT calendar days a candidate
 * actually uses (a shared day counts once), and the search tries actual
 * day-SETS in the order given by the caller's spec:
 *   1. separate days   (dominant fixed, secondary tries disjoint day-sets)
 *   2. share a day     (same loop, secondary's tiered candidates include
 *                        increasing overlap once disjoint sets are exhausted)
 *   3. move the dominant (only reached if step 1-2 found nothing at the
 *                        domains' full requested counts)
 *   4. reduce          (last resort — see below)
 * Steps 1-3 never touch a domain's requested COUNT — only WHERE its
 * existing trainings land. Reduction is a separate, later phase.
 *
 * ── Reduction — R7's floor is absolute, dominance is irrelevant here ──
 * If no day-set arrangement satisfies both domains at their full requested
 * counts, running's count is reduced first (toward 0) while strength stays
 * at its full request; only once running has been swept all the way to 0
 * without success does strength's count get reduced, and even then never
 * below crossDomainContext.minStrengthDaysPerWeek (R7). This is NOT
 * dominance-based (a running-dominant input does not protect running's
 * count here) — R7 is a fixed floor from the source research doc, running
 * has no equivalent floor, so running is what gives way. If the floor
 * itself blocks a fit, the result keeps the floor and drops running volume
 * instead, with an explicit note.
 */

import type {
  RuleFamily,
  RuleFamilyReduction,
  StrengthValidateContext,
  StrengthReduceContext,
  RunningReduceContext,
} from './ruleFamily';
import type { ScheduleDay } from '../types/smartSchedule.types';
import { type RunningWeekDay, type RunningWeekContext } from './runningRules';
import {
  type CrossDomainValidateContext,
  type DoubleDayOrder,
  resolveDoubleDayOrder,
  validateCrossDomain,
} from './crossDomainRules';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface WeaveDomainInput<TWeek, TValidateContext, TReduceContext> {
  family: RuleFamily<TWeek, TValidateContext, TReduceContext>;
  /** How many training days the user asked for in this domain. */
  requestedCount: number;
  /** This domain's own current/proposed week — always real, see file header. */
  existingWeek: TWeek;
  validateContext: TValidateContext;
  reduceContext: TReduceContext;
}

export interface WeaveWeekInput {
  /** 0-100. 0 = full strength focus, 100 = full running focus. See file header. */
  focus: number;
  strength: WeaveDomainInput<ScheduleDay[], StrengthValidateContext, StrengthReduceContext>;
  running: WeaveDomainInput<RunningWeekDay[], RunningWeekContext, RunningReduceContext>;
  /** Total distinct calendar days/week the user can train — shared across both domains. A day hosting both domains counts once. */
  availableDayCount: number;
  crossDomainContext: CrossDomainValidateContext;
}

export interface WeaveWeekResult {
  week: { strength: ScheduleDay[]; running: RunningWeekDay[] };
  /** One entry per day that ended up hosting BOTH domains in the final result. `order` comes from crossDomainRules.ts's resolveDoubleDayOrder — this file never decides it itself, only asks. */
  sharedDays: Array<{ dayOfWeek: number; order: DoubleDayOrder }>;
  notes: string[];
  reductions: Array<{ domainId: 'strength' | 'running'; removed: string[] }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Combinatorics helpers — pure, no domain knowledge
// ──────────────────────────────────────────────────────────────────────────

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** All k-subsets of `days`, in lexicographic order relative to `days`' own order. */
function combinationsOf(days: number[], k: number): number[][] {
  if (k < 0 || k > days.length) return [];
  if (k === 0) return [[]];
  const result: number[][] = [];
  const chosen: number[] = [];
  function recurse(start: number): void {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < days.length; i++) {
      chosen.push(days[i]);
      recurse(i + 1);
      chosen.pop();
    }
  }
  recurse(0);
  return result;
}

/**
 * All k-subsets of the full week, sorted by ascending overlap with
 * `fixedDays` first (fewest shared days tried first — "separate days"
 * before "share a day"), then lexicographically within each overlap tier
 * for determinism. Fully total-ordered (no two distinct arrays compare
 * equal), so the result order never depends on sort stability.
 */
function tieredCandidates(k: number, fixedDays: number[]): number[][] {
  const fixedSet = new Set(fixedDays);
  const all = combinationsOf(ALL_DAYS, k);
  return all.sort((a, b) => {
    const overlapA = a.filter((d) => fixedSet.has(d)).length;
    const overlapB = b.filter((d) => fixedSet.has(d)).length;
    if (overlapA !== overlapB) return overlapA - overlapB;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });
}

function sameDaySet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((d, i) => d === sortedB[i]);
}

// ──────────────────────────────────────────────────────────────────────────
// attemptCombo — placeOn then validate of all three families
// ──────────────────────────────────────────────────────────────────────────

interface DomainSearchCtx<TWeek, TValidateContext, TReduceContext> {
  family: RuleFamily<TWeek, TValidateContext, TReduceContext>;
  base: TWeek;
  validateContext: TValidateContext;
  reduceContext: TReduceContext;
}

interface ComboAttempt {
  ok: boolean;
  strengthWeek?: ScheduleDay[];
  runningWeek?: RunningWeekDay[];
  /** ERROR-level violation codes from any of the three families, whether this attempt succeeded or not — used to explain a later compromise even though THIS specific candidate wasn't the one chosen. */
  errorCodes: string[];
}

function attemptCombo(
  strengthCtx: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext>,
  strengthDays: number[],
  runningCtx: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext>,
  runningDays: number[],
  crossDomainContext: CrossDomainValidateContext,
): ComboAttempt {
  const strengthWeek = strengthCtx.family.placeOn(strengthCtx.base, strengthDays, strengthCtx.reduceContext);
  const runningWeek = runningCtx.family.placeOn(runningCtx.base, runningDays, runningCtx.reduceContext);
  if (!strengthWeek || !runningWeek) return { ok: false, errorCodes: [] };

  const strengthValidation = strengthCtx.family.validate(strengthWeek, strengthCtx.validateContext);
  const runningValidation = runningCtx.family.validate(runningWeek, runningCtx.validateContext);
  const crossValidation = validateCrossDomain({ strength: strengthWeek, running: runningWeek }, crossDomainContext);

  const errorCodes = [...strengthValidation.violations, ...runningValidation.violations, ...crossValidation.violations]
    .filter((v) => v.severity === 'ERROR')
    .map((v) => v.code);

  const ok = strengthValidation.valid && runningValidation.valid && crossValidation.valid;
  return ok ? { ok: true, strengthWeek, runningWeek, errorCodes } : { ok: false, errorCodes };
}

// ──────────────────────────────────────────────────────────────────────────
// searchDaySets — one (strengthCount, runningCount) pair, day-set search only
// ──────────────────────────────────────────────────────────────────────────

interface SearchBudget {
  tried: number;
  encounteredCodes: Set<string>;
}

/**
 * Bounded search cap. Worst case per (strengthCount, runningCount) pair:
 * Phase 1 (dominant fixed) tries at most C(7,secondaryCount) ≤ 35 secondary
 * day-sets. Phase 2 (dominant also moves, only reached if Phase 1 finds
 * nothing) tries at most C(7,dominantCount) ≤ 35 dominant day-sets × 35
 * secondary day-sets ≈ 1225 — reached only once, at the full-count search,
 * before any reduction. The reduction sweep (Phase 1 only, per the file
 * header) tries up to ~7 strength levels × ~8 running levels ≈ 56 pairs ×
 * 35 ≈ 1960. Total worst case ≈ 35 + 1225 + 1960 ≈ 3220 — 6000 leaves
 * comfortable margin without being an effectively-unbounded loop.
 */
const MAX_CANDIDATES = 6000;

function searchDaySets(
  strengthCtx: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext>,
  strengthCount: number,
  runningCtx: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext>,
  runningCount: number,
  availableDayCount: number,
  crossDomainContext: CrossDomainValidateContext,
  dominantId: 'strength' | 'running',
  moveDominant: boolean,
  budget: SearchBudget,
): { strengthWeek: ScheduleDay[]; runningWeek: RunningWeekDay[]; strengthDays: number[]; runningDays: number[] } | null {
  const dominantIsStrength = dominantId === 'strength';
  const dominantCount = dominantIsStrength ? strengthCount : runningCount;
  const secondaryCount = dominantIsStrength ? runningCount : strengthCount;
  const dominantFamily = dominantIsStrength ? strengthCtx.family : runningCtx.family;

  const dominantPreferred = dominantFamily.preferredDays(dominantCount);
  const dominantCandidates = moveDominant
    ? [dominantPreferred, ...combinationsOf(ALL_DAYS, dominantCount).filter((c) => !sameDaySet(c, dominantPreferred))]
    : [dominantPreferred];

  for (const dominantDays of dominantCandidates) {
    for (const secondaryDays of tieredCandidates(secondaryCount, dominantDays)) {
      if (budget.tried >= MAX_CANDIDATES) return null;
      budget.tried++;

      const distinctDays = new Set([...dominantDays, ...secondaryDays]).size;
      if (distinctDays > availableDayCount) continue;

      const strengthDays = dominantIsStrength ? dominantDays : secondaryDays;
      const runningDays = dominantIsStrength ? secondaryDays : dominantDays;
      const attempt = attemptCombo(strengthCtx, strengthDays, runningCtx, runningDays, crossDomainContext);
      attempt.errorCodes.forEach((code) => budget.encounteredCodes.add(code));

      if (attempt.ok) {
        return { strengthWeek: attempt.strengthWeek!, runningWeek: attempt.runningWeek!, strengthDays, runningDays };
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Rule-code → Hebrew note, for compromises traced to a specific ERROR
// ──────────────────────────────────────────────────────────────────────────

const RULE_NOTE_HE: Record<string, string> = {
  R3: 'R3: כוח וריצת איכות לא יכולים באותו יום — סדר לא ניתן לאימות, לכן נמנע שיתוף כזה.',
  R6: 'R6: כוח לא יכול ביום עם ריצה ארוכה — הריצה הארוכה מוגנת.',
  R8: 'R8: עם 4 אימונים או פחות בסך הכל, מותר לכל היותר יום משותף אחד.',
};

// ──────────────────────────────────────────────────────────────────────────
// weaveWeek
// ──────────────────────────────────────────────────────────────────────────

export function weaveWeek(input: WeaveWeekInput): WeaveWeekResult {
  const dominantId: 'strength' | 'running' = input.focus < 50 ? 'strength' : 'running';
  const budget: SearchBudget = { tried: 0, encounteredCodes: new Set() };

  const strengthCtxFull: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
    family: input.strength.family,
    base: input.strength.existingWeek,
    validateContext: input.strength.validateContext,
    reduceContext: input.strength.reduceContext,
  };
  const runningCtxFull: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
    family: input.running.family,
    base: input.running.existingWeek,
    validateContext: input.running.validateContext,
    reduceContext: input.running.reduceContext,
  };

  const fullStrengthCount = input.strength.requestedCount;
  const fullRunningCount = input.running.requestedCount;
  const floor = input.crossDomainContext.minStrengthDaysPerWeek;

  // Steps 1-2 (separate days → share a day): dominant fixed at preferredDays.
  let found =
    searchDaySets(strengthCtxFull, fullStrengthCount, runningCtxFull, fullRunningCount, input.availableDayCount, input.crossDomainContext, dominantId, false, budget) ??
    // Step 3 (move the dominant): only reached if steps 1-2 found nothing.
    searchDaySets(strengthCtxFull, fullStrengthCount, runningCtxFull, fullRunningCount, input.availableDayCount, input.crossDomainContext, dominantId, true, budget);

  let finalStrengthCount = fullStrengthCount;
  let finalRunningCount = fullRunningCount;
  let strengthReduction: RuleFamilyReduction<ScheduleDay[]> | null = null;
  let runningReduction: RuleFamilyReduction<RunningWeekDay[]> | null = null;

  if (!found) {
    // Step 4 (reduction, last resort): running swept to 0 before strength
    // ever drops below `floor` — see file header on why this is NOT
    // dominance-based. The `sCount >= floor` bound is a search-budget
    // optimization, not the sole enforcement mechanism — validateCrossDomain
    // itself already rejects any candidate with strength < floor via R7, so
    // trying sCount below floor would only ever waste budget on doomed
    // candidates, never produce a false success. Confirmed empirically: the
    // bound was temporarily removed during this file's own test
    // verification and the result was unchanged (the total-failure fallback
    // still won, because R7 rejected the below-floor attempt too).
    searchLoop: for (let sCount = fullStrengthCount; sCount >= floor; sCount--) {
      const rStart = sCount === fullStrengthCount ? fullRunningCount - 1 : fullRunningCount;
      for (let rCount = rStart; rCount >= 0; rCount--) {
        const sReduction = sCount === fullStrengthCount ? null : input.strength.family.reduceTo(input.strength.existingWeek, sCount, input.strength.reduceContext);
        const rReduction = rCount === fullRunningCount ? null : input.running.family.reduceTo(input.running.existingWeek, rCount, input.running.reduceContext);
        const strengthCtx: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
          ...strengthCtxFull,
          base: sReduction ? sReduction.week : strengthCtxFull.base,
        };
        const runningCtx: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
          ...runningCtxFull,
          base: rReduction ? rReduction.week : runningCtxFull.base,
        };

        const attempt = searchDaySets(strengthCtx, sCount, runningCtx, rCount, input.availableDayCount, input.crossDomainContext, dominantId, false, budget);
        if (attempt) {
          found = attempt;
          finalStrengthCount = sCount;
          finalRunningCount = rCount;
          strengthReduction = sReduction;
          runningReduction = rReduction;
          break searchLoop;
        }
        if (budget.tried >= MAX_CANDIDATES) break searchLoop;
      }
    }
  }

  const notes: string[] = [];
  const reductions: Array<{ domainId: 'strength' | 'running'; removed: string[] }> = [];

  if (!found) {
    // Search exhausted with no valid combination anywhere in the space —
    // fall back to strength alone, at the floor, on its own preferred days;
    // running gets nothing. Safer than returning something unvalidated.
    const fallbackStrengthWeek = input.strength.family.placeOn(
      input.strength.existingWeek,
      input.strength.family.preferredDays(floor),
      input.strength.reduceContext,
    ) ?? input.strength.family.reduceTo(input.strength.existingWeek, floor, input.strength.reduceContext).week;
    const fallbackRunningReduction = input.running.family.reduceTo(input.running.existingWeek, 0, input.running.reduceContext);
    notes.push(
      `R7: לא נמצא שילוב חוקי בטווח החיפוש — הלוז צומצם למינימום הבטוח, שומר על רצפת ${floor} ימי הכוח בלבד; נפח הריצה הושמט לגמרי.`,
      ...fallbackRunningReduction.notes,
    );
    return {
      week: { strength: fallbackStrengthWeek, running: fallbackRunningReduction.week },
      sharedDays: [],
      notes,
      reductions: [{ domainId: 'running', removed: fallbackRunningReduction.removed }],
    };
  }

  if (finalRunningCount < fullRunningCount) {
    reductions.push({ domainId: 'running', removed: runningReduction?.removed ?? [] });
    notes.push(...(runningReduction?.notes ?? []));
  }
  if (finalStrengthCount < fullStrengthCount) {
    reductions.push({ domainId: 'strength', removed: strengthReduction?.removed ?? [] });
    notes.push(...(strengthReduction?.notes ?? []));
    notes.push(
      `R7: הרצפה של ${floor} ימי כוח בשבוע נשמרה, אבל לא נמצא שילוב שגם שומר עליה וגם על מלוא נפח הכוח המבוקש (${fullStrengthCount}) — הכוח הוקטן ל-${finalStrengthCount}.`,
    );
  }

  for (const code of Array.from(budget.encounteredCodes)) {
    if (code === 'R7') continue; // R7 already covered by the dedicated message above when it actually bound; avoid a duplicate generic line.
    const note = RULE_NOTE_HE[code];
    if (note) notes.push(note);
  }

  const strengthDaysFinal = found.strengthDays;
  const runningDaysFinal = found.runningDays;
  const sharedDayNums = strengthDaysFinal.filter((d) => runningDaysFinal.includes(d)).sort((a, b) => a - b);
  const sharedDays = sharedDayNums.map((dayOfWeek) => {
    const strengthDay = found!.strengthWeek.find((d) => d.dayOfWeek === dayOfWeek)!;
    const runningDay = found!.runningWeek.find((d) => d.dayOfWeek === dayOfWeek)!;
    const order = resolveDoubleDayOrder({ strength: strengthDay, running: runningDay }, input.crossDomainContext);
    return { dayOfWeek, order };
  });

  return {
    week: { strength: found.strengthWeek, running: found.runningWeek },
    sharedDays,
    notes,
    reductions,
  };
}
