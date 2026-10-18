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
import {
  type RunningDayRole,
  type RunningWeekContext,
  type RunningWeekDay,
  isQualityDay,
  isTrainingDay,
  matchesSlotTypeForDrop,
} from './runningRules';
import {
  type CrossDomainValidateContext,
  type DoubleDayOrder,
  resolveDoubleDayOrder,
  validateCrossDomain,
} from './crossDomainRules';
import { renderScheduleReasonsHe, sortScheduleReasons, type ScheduleReason } from './reasons';

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
  /**
   * Typed reasons that BIND on the final week (schedule advisor phase A, bug #6): a rule is
   * reported only when lifting it would have produced a different week (see
   * bindingRuleReasons), plus the soft findings present in the final week itself. Never
   * "a rule some rejected candidate tripped over".
   */
  reasons: ScheduleReason[];
  /** `reasons`, rendered by the one Hebrew renderer (reasons.ts). No codes, no ids. */
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
function adjacentPairs(days: number[]): number {
  let n = 0;
  for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] === 1) n++;
  return n;
}

function tieredCandidates(k: number, fixedDays: number[], ownDays: number[] = []): number[][] {
  const fixedSet = new Set(fixedDays);
  const ownSet = new Set(ownDays);
  const all = combinationsOf(ALL_DAYS, k);
  return all.sort((a, b) => {
    const overlapA = a.filter((d) => fixedSet.has(d)).length;
    const overlapB = b.filter((d) => fixedSet.has(d)).length;
    if (overlapA !== overlapB) return overlapA - overlapB;
    // The user's own days first, within a tier (schedule advisor phase A): a strength
    // user who trains Sun/Tue/Fri keeps those days whenever the rules allow it.
    const ownA = a.filter((d) => ownSet.has(d)).length;
    const ownB = b.filter((d) => ownSet.has(d)).length;
    if (ownA !== ownB) return ownB - ownA;
    // Spread before back-to-back (schedule advisor phase A): now that strength can be
    // placed on any day-set (ruleFamily strengthPlaceOn), the plain lexicographic order
    // would pick Mon+Tue+Wed before Mon+Wed+Fri. Pure combinatorics, no domain knowledge.
    const adjA = adjacentPairs(a);
    const adjB = adjacentPairs(b);
    if (adjA !== adjB) return adjA - adjB;
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
  /** The user's current training days in this domain (from existingWeek) — a search preference, never a constraint. */
  ownDays: number[];
  validateContext: TValidateContext;
  reduceContext: TReduceContext;
}

interface ComboAttempt {
  ok: boolean;
  strengthWeek?: ScheduleDay[];
  runningWeek?: RunningWeekDay[];
  /** Populated whenever ok — the order decided for each shared day, so the caller never has to recompute it. */
  sharedDayOrder?: Partial<Record<number, DoubleDayOrder>>;
  /** ERROR-level violation codes from any of the three families, whether this attempt succeeded or not — used to explain a later compromise even though THIS specific candidate wasn't the one chosen. */
  errorCodes: string[];
}

/** order (R2) must be decided BEFORE the candidate is validated, not after — R3 needs to know it (see crossDomainRules.ts's own doc). Never computed inside validateCrossDomain itself; only ever consumed there. */
function computeSharedDayOrder(
  strengthWeek: ScheduleDay[],
  runningWeek: RunningWeekDay[],
  crossDomainContext: CrossDomainValidateContext,
): Partial<Record<number, DoubleDayOrder>> {
  const sharedDayOrder: Partial<Record<number, DoubleDayOrder>> = {};
  for (const strengthDay of strengthWeek) {
    if (strengthDay.sessions.length === 0) continue;
    const runningDay = runningWeek.find((d) => d.dayOfWeek === strengthDay.dayOfWeek);
    if (!runningDay || runningDay.category === null) continue;
    sharedDayOrder[strengthDay.dayOfWeek] = resolveDoubleDayOrder(
      { strength: strengthDay, running: runningDay },
      crossDomainContext,
    );
  }
  return sharedDayOrder;
}

function attemptCombo(
  strengthCtx: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext>,
  strengthDays: number[],
  runningCtx: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext>,
  runningDays: number[],
  crossDomainContext: CrossDomainValidateContext,
  disabled: ReadonlySet<string>,
): ComboAttempt {
  const strengthWeek = strengthCtx.family.placeOn(strengthCtx.base, strengthDays, strengthCtx.reduceContext);
  const runningWeek = runningCtx.family.placeOn(runningCtx.base, runningDays, runningCtx.reduceContext);
  if (!strengthWeek || !runningWeek) return { ok: false, errorCodes: [] };

  const strengthValidation = strengthCtx.family.validate(strengthWeek, strengthCtx.validateContext);
  const runningValidation = runningCtx.family.validate(runningWeek, runningCtx.validateContext);
  const sharedDayOrder = computeSharedDayOrder(strengthWeek, runningWeek, crossDomainContext);
  const crossValidation = validateCrossDomain({ strength: strengthWeek, running: runningWeek, sharedDayOrder }, crossDomainContext);

  const errorCodes = [...strengthValidation.violations, ...runningValidation.violations, ...crossValidation.violations]
    .filter((v) => v.severity === 'ERROR')
    .map((v) => v.code);

  // `disabled` only ever holds codes during the binding check (bindingRuleReasons): "would
  // the week differ if this rule did not exist?". The real search passes an empty set.
  const ok = errorCodes.every((c) => disabled.has(c));
  return ok ? { ok: true, strengthWeek, runningWeek, sharedDayOrder, errorCodes } : { ok: false, errorCodes };
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

interface FoundWeek {
  strengthWeek: ScheduleDay[];
  runningWeek: RunningWeekDay[];
  strengthDays: number[];
  runningDays: number[];
  sharedDayOrder: Partial<Record<number, DoubleDayOrder>>;
}

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
  disabled: ReadonlySet<string>,
): FoundWeek | null {
  const dominantIsStrength = dominantId === 'strength';
  const dominantCount = dominantIsStrength ? strengthCount : runningCount;
  const secondaryCount = dominantIsStrength ? runningCount : strengthCount;
  const dominantFamily = dominantIsStrength ? strengthCtx.family : runningCtx.family;

  // The dominant domain is tried FIXED first — on the user's OWN current days when they
  // hold exactly the requested count (schedule advisor phase A: a runner whose long run is
  // on Saturday keeps it there), then on the domain's preferred days.
  const dominantOwn = dominantIsStrength ? strengthCtx.ownDays : runningCtx.ownDays;
  const secondaryOwn = dominantIsStrength ? runningCtx.ownDays : strengthCtx.ownDays;
  const dominantPreferred = dominantFamily.preferredDays(dominantCount);
  const fixedFirst: number[][] =
    dominantOwn.length === dominantCount && !sameDaySet(dominantOwn, dominantPreferred)
      ? [dominantOwn, dominantPreferred]
      : [dominantPreferred];
  const dominantCandidates = moveDominant
    ? [...fixedFirst, ...combinationsOf(ALL_DAYS, dominantCount).filter((c) => !fixedFirst.some((f) => sameDaySet(c, f)))]
    : fixedFirst;

  for (const dominantDays of dominantCandidates) {
    for (const secondaryDays of tieredCandidates(secondaryCount, dominantDays, secondaryOwn)) {
      if (budget.tried >= MAX_CANDIDATES) return null;
      budget.tried++;

      const distinctDays = new Set([...dominantDays, ...secondaryDays]).size;
      if (distinctDays > availableDayCount) continue;

      const strengthDays = dominantIsStrength ? dominantDays : secondaryDays;
      const runningDays = dominantIsStrength ? secondaryDays : dominantDays;
      const attempt = attemptCombo(strengthCtx, strengthDays, runningCtx, runningDays, crossDomainContext, disabled);
      attempt.errorCodes.forEach((code) => budget.encounteredCodes.add(code));

      if (attempt.ok) {
        return {
          strengthWeek: attempt.strengthWeek!,
          runningWeek: attempt.runningWeek!,
          strengthDays,
          runningDays,
          sharedDayOrder: attempt.sharedDayOrder!,
        };
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// weaveCore — one full search (steps 1-4), for a given set of disabled rules
// ──────────────────────────────────────────────────────────────────────────

interface CoreResult {
  found: FoundWeek | null;
  finalStrengthCount: number;
  finalRunningCount: number;
  strengthReduction: RuleFamilyReduction<ScheduleDay[]> | null;
  runningReduction: RuleFamilyReduction<RunningWeekDay[]> | null;
  encounteredCodes: Set<string>;
}

function weaveCore(input: WeaveWeekInput, disabled: ReadonlySet<string>): CoreResult {
  const dominantId: 'strength' | 'running' = input.focus < 50 ? 'strength' : 'running';
  const budget: SearchBudget = { tried: 0, encounteredCodes: new Set() };

  const strengthCtxFull: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
    family: input.strength.family,
    base: input.strength.existingWeek,
    ownDays: input.strength.existingWeek.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek).sort((a, b) => a - b),
    validateContext: input.strength.validateContext,
    reduceContext: input.strength.reduceContext,
  };
  const runningCtxFull: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
    family: input.running.family,
    base: input.running.existingWeek,
    ownDays: input.running.existingWeek.filter((d) => isTrainingDay(d)).map((d) => d.dayOfWeek).sort((a, b) => a - b),
    validateContext: input.running.validateContext,
    reduceContext: input.running.reduceContext,
  };

  const fullStrengthCount = input.strength.requestedCount;
  const fullRunningCount = input.running.requestedCount;
  const floor = disabled.has('R7') ? 0 : Math.min(input.crossDomainContext.minStrengthDaysPerWeek, fullStrengthCount);

  // Steps 1-2 (separate days → share a day): dominant fixed at preferredDays.
  let found =
    searchDaySets(strengthCtxFull, fullStrengthCount, runningCtxFull, fullRunningCount, input.availableDayCount, input.crossDomainContext, dominantId, false, budget, disabled) ??
    // Step 3 (move the dominant): only reached if steps 1-2 found nothing.
    searchDaySets(strengthCtxFull, fullStrengthCount, runningCtxFull, fullRunningCount, input.availableDayCount, input.crossDomainContext, dominantId, true, budget, disabled);

  let finalStrengthCount = fullStrengthCount;
  let finalRunningCount = fullRunningCount;
  let strengthReduction: RuleFamilyReduction<ScheduleDay[]> | null = null;
  let runningReduction: RuleFamilyReduction<RunningWeekDay[]> | null = null;

  if (!found) {
    // Step 4 (reduction, last resort): running swept to 0 before strength
    // ever drops below `floor` — see file header on why this is NOT
    // dominance-based. The `sCount >= floor` bound is a search-budget
    // optimization; validateCrossDomain's R7 rejects below-floor candidates anyway.
    searchLoop: for (let sCount = fullStrengthCount; sCount >= floor; sCount--) {
      const rStart = sCount === fullStrengthCount ? fullRunningCount - 1 : fullRunningCount;
      for (let rCount = rStart; rCount >= 0; rCount--) {
        const sReduction = sCount === fullStrengthCount ? null : input.strength.family.reduceTo(input.strength.existingWeek, sCount, input.strength.reduceContext);
        const rReduction = rCount === fullRunningCount ? null : input.running.family.reduceTo(input.running.existingWeek, rCount, input.running.reduceContext);
        const strengthCtx: DomainSearchCtx<ScheduleDay[], StrengthValidateContext, StrengthReduceContext> = {
          ...strengthCtxFull,
          base: sReduction ? sReduction.week : strengthCtxFull.base,
          ownDays: sReduction
            ? sReduction.week.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek).sort((a, b) => a - b)
            : strengthCtxFull.ownDays,
        };
        const runningCtx: DomainSearchCtx<RunningWeekDay[], RunningWeekContext, RunningReduceContext> = {
          ...runningCtxFull,
          base: rReduction ? rReduction.week : runningCtxFull.base,
          ownDays: rReduction
            ? rReduction.week.filter((d) => isTrainingDay(d)).map((d) => d.dayOfWeek).sort((a, b) => a - b)
            : runningCtxFull.ownDays,
        };

        const attempt = searchDaySets(strengthCtx, sCount, runningCtx, rCount, input.availableDayCount, input.crossDomainContext, dominantId, false, budget, disabled);
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

  return { found, finalStrengthCount, finalRunningCount, strengthReduction, runningReduction, encounteredCodes: budget.encounteredCodes };
}

// ──────────────────────────────────────────────────────────────────────────
// Reasons — only what binds on the final week
// ──────────────────────────────────────────────────────────────────────────

/** ERROR codes whose binding the weaver can test by lifting them (R1/R2 never fail). */
const BINDABLE_CODES = ['R3', 'R4', 'R6', 'R6b', 'R7', 'R8', 'RUN-01', 'RUN-04'] as const;

function weekSignature(core: CoreResult): string {
  if (!core.found) return 'none';
  return `${core.found.strengthDays.join(',')}|${core.found.runningDays.join(',')}`;
}

/** The running slots reduceTo dropped, read from the before/after weeks (never from text). */
function droppedSlots(before: RunningWeekDay[], after: RunningWeekDay[]): RunningDayRole[] {
  const order: RunningDayRole[] = ['recovery', 'easy_run', 'quality_secondary', 'long_run', 'quality_primary'];
  const out: RunningDayRole[] = [];
  for (const day of before) {
    if (!isTrainingDay(day)) continue;
    const kept = after.find((d) => d.dayOfWeek === day.dayOfWeek);
    if (kept && isTrainingDay(kept)) continue;
    const role = order.find((slot) => matchesSlotTypeForDrop(day, slot).matches) ?? 'easy_run';
    out.push(role === 'quality_secondary' && day.slotType === undefined ? 'quality_primary' : role);
  }
  return out;
}

function ruleReason(code: string, input: WeaveWeekInput): ScheduleReason | null {
  switch (code) {
    case 'R3':
      return null; // satisfied by construction (R2 orders a quality shared day running-first) — see QUALITY_RUN_FIRST
    case 'R4':
      return { code: 'LEGS_BEFORE_KEY_RUN', run: 'quality', soft: false };
    case 'R6b':
      return { code: 'LEGS_BEFORE_KEY_RUN', run: 'long', soft: false };
    case 'R6':
      return { code: 'LONG_RUN_PROTECTED' };
    case 'R7':
      return { code: 'STRENGTH_FLOOR', floor: input.crossDomainContext.minStrengthDaysPerWeek };
    case 'R8':
      return { code: 'ONE_SHARED_DAY_MAX' };
    case 'RUN-01':
      return { code: 'RUN_SPACING' };
    case 'RUN-04': {
      const level = input.running.validateContext.level;
      return { code: 'RUN_STREAK_CAP', max: level === 'beginner' ? 2 : level === 'advanced' ? 4 : 3 };
    }
    default:
      return null;
  }
}

function weaveReasons(input: WeaveWeekInput, core: CoreResult): ScheduleReason[] {
  const found = core.found!;
  const reasons: ScheduleReason[] = [];
  const baseSig = weekSignature(core);

  // 1. Hard rules that bind: lifting the rule would change the week.
  for (const code of BINDABLE_CODES) {
    if (!core.encounteredCodes.has(code)) continue;
    const alt = weaveCore(input, new Set([code]));
    const differs =
      weekSignature(alt) !== baseSig ||
      alt.finalRunningCount !== core.finalRunningCount ||
      alt.finalStrengthCount !== core.finalStrengthCount;
    if (!differs) continue;
    const r = ruleReason(code, input);
    if (r) reasons.push(r);
  }

  // 2. Reductions actually applied.
  if (core.finalRunningCount < input.running.requestedCount) {
    reasons.push({
      code: 'RUNNING_REDUCED',
      from: input.running.requestedCount,
      to: core.finalRunningCount,
      dropped: droppedSlots(input.running.existingWeek, core.runningReduction?.week ?? found.runningWeek),
    });
  }
  if (core.finalStrengthCount < input.strength.requestedCount) {
    reasons.push({ code: 'STRENGTH_REDUCED', from: input.strength.requestedCount, to: core.finalStrengthCount });
  }
  const requestedTotal = input.strength.requestedCount + input.running.requestedCount;
  if (
    (core.finalRunningCount < input.running.requestedCount || core.finalStrengthCount < input.strength.requestedCount) &&
    input.availableDayCount < requestedTotal
  ) {
    reasons.push({ code: 'AVAILABILITY_SHORT', available: input.availableDayCount, requested: requestedTotal });
  }

  // 3. Soft findings present in the final week itself.
  const sharedDayOrder = found.sharedDayOrder;
  const finalCross = validateCrossDomain(
    { strength: found.strengthWeek, running: found.runningWeek, sharedDayOrder },
    input.crossDomainContext,
  );
  for (const v of finalCross.violations) {
    if (v.severity !== 'WARN') continue;
    if (v.code === 'R5') reasons.push({ code: 'EASY_DAY_DOUBLED', day: v.affectedDays[0] ?? 0 });
    if (v.code === 'R4') reasons.push({ code: 'LEGS_BEFORE_KEY_RUN', run: 'quality', soft: true, day: v.affectedDays[0] ?? 0 });
    if (v.code === 'R6b') reasons.push({ code: 'LEGS_BEFORE_KEY_RUN', run: 'long', soft: true, day: v.affectedDays[0] ?? 0 });
  }
  for (const [dayKey, order] of Object.entries(sharedDayOrder)) {
    const day = Number(dayKey);
    const runDay = found.runningWeek.find((d) => d.dayOfWeek === day);
    if (order === 'running-first' && runDay && isQualityDay(runDay)) reasons.push({ code: 'QUALITY_RUN_FIRST', day });
  }
  const strengthValidation = input.strength.family.validate(found.strengthWeek, input.strength.validateContext);
  if (strengthValidation.violations.some((v) => v.code === 'WARN_15')) reasons.push({ code: 'SATURDAY_USED' });

  return reasons;
}

// ──────────────────────────────────────────────────────────────────────────
// weaveWeek
// ──────────────────────────────────────────────────────────────────────────

function emptyStrengthWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i as ScheduleDay['dayOfWeek'], sessions: [], isRestDay: true, warnings: [] }));
}

export function weaveWeek(input: WeaveWeekInput): WeaveWeekResult {
  const core = weaveCore(input, new Set());
  const floor = Math.min(input.crossDomainContext.minStrengthDaysPerWeek, input.strength.requestedCount);

  if (!core.found) {
    // Search exhausted with no valid combination anywhere in the space — fall back to
    // strength alone, at the floor, on its own preferred days; running gets nothing.
    // Never invents a domain (bug #1): a user with no strength request (unowned, or the
    // running tab) gets an empty strength side here, never a default UPPER_BODY template.
    const fallbackStrengthWeek =
      floor <= 0
        ? emptyStrengthWeek()
        : input.strength.family.placeOn(
            input.strength.existingWeek,
            input.strength.family.preferredDays(floor),
            input.strength.reduceContext,
          ) ?? input.strength.family.reduceTo(input.strength.existingWeek, floor, input.strength.reduceContext).week;
    const fallbackRunningReduction = input.running.family.reduceTo(input.running.existingWeek, 0, input.running.reduceContext);
    const reasons: ScheduleReason[] = [{ code: 'NO_VALID_WEEK' }];
    if (input.running.requestedCount > 0) {
      reasons.push({
        code: 'RUNNING_REDUCED',
        from: input.running.requestedCount,
        to: 0,
        dropped: droppedSlots(input.running.existingWeek, fallbackRunningReduction.week),
      });
    }
    const sorted = sortScheduleReasons(reasons);
    return {
      week: { strength: fallbackStrengthWeek, running: fallbackRunningReduction.week },
      sharedDays: [],
      reasons: sorted,
      notes: renderScheduleReasonsHe(sorted),
      reductions: [{ domainId: 'running', removed: fallbackRunningReduction.removed }],
    };
  }

  const reductions: Array<{ domainId: 'strength' | 'running'; removed: string[] }> = [];
  if (core.finalRunningCount < input.running.requestedCount) {
    reductions.push({ domainId: 'running', removed: core.runningReduction?.removed ?? [] });
  }
  if (core.finalStrengthCount < input.strength.requestedCount) {
    reductions.push({ domainId: 'strength', removed: core.strengthReduction?.removed ?? [] });
  }

  // Reuses the order already decided (and already fed into R3's own check)
  // inside attemptCombo — never recomputed here. Same order, same source.
  const found = core.found;
  const sharedDayNums = found.strengthDays.filter((d) => found.runningDays.includes(d)).sort((a, b) => a - b);
  const sharedDays = sharedDayNums.map((dayOfWeek) => ({
    dayOfWeek,
    order: found.sharedDayOrder[dayOfWeek]!,
  }));

  const reasons = sortScheduleReasons(weaveReasons(input, core));
  return {
    week: { strength: found.strengthWeek, running: found.runningWeek },
    sharedDays,
    reasons,
    notes: renderScheduleReasonsHe(reasons),
    reductions,
  };
}
