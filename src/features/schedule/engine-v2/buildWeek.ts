/**
 * buildWeek — the v2 schedule engine entry point (pure; no callers switched yet).
 *
 * availability + programs (load vectors) + run plan (by slot type) + priority + existing
 * week + this week's history → a week: ordered sessions per day, a Hebrew reason per day,
 * warnings, and a diff vs the existing week.
 *
 * Flow: units → reduction ladder (conflict order by priority) → for each step the best
 * grid by backtracking (hard rules prune, soft rules score) → the cheapest step wins →
 * finalize (in-day order, free slots, volumes) → explain → diff.
 */
import { DEFAULT_PRIORITY, W } from './config';
import { longRunTargetDay, resolveDays } from './availability';
import { diffWeek, refKey } from './diff';
import { dayReasons } from './explain';
import { finalizeLayout } from './finalize';
import { renderV2ReasonsHe, type V2Reason } from './reasonsV2';
import { checkHardRules, emptyGrid, isLongRun, runStreakCap, type Grid } from './rules';
import { streakComfortOf, type ScoreCtx } from './score';
import { searchWeek, type SearchResult } from './search';
import { applyLadder, buildUnits, makeRunUnit, makeStrengthUnit, type ReducedSet, type Unit } from './units';
import { canonicalSlug } from './programProfiles';
import type { DayPlan, ScheduleEngineInput, SessionRef, WeekPlan } from './types';

function existingCounts(input: ScheduleEngineInput, frozen: readonly boolean[]): Map<string, number[]> | null {
  const ex = input.existing;
  if (!ex) return null;
  const m = new Map<string, number[]>();
  for (let d = 0; d < 7; d++) {
    if (frozen[d]) continue;
    for (const r of ex.days[d] ?? []) {
      const k = refKey(r);
      const arr = m.get(k) ?? Array(7).fill(0);
      arr[d]++;
      m.set(k, arr);
    }
  }
  return m;
}

/** Frozen (past) days keep their existing sessions; those sessions are consumed from the plan. */
function freezePast(input: ScheduleEngineInput, frozen: readonly boolean[], runs: Unit[], strength: Unit[]): Grid {
  const g = emptyGrid();
  for (let d = 0; d < 7; d++) {
    if (!frozen[d]) continue;
    for (const r of input.existing?.days[d] ?? []) {
      if (r.kind === 'run') {
        const i = runs.findIndex((u) => u.slot === r.slot);
        if (i >= 0) runs.splice(i, 1);
        g.run[d] = makeRunUnit(r.slot, `frozen:run:${d}`);
      } else {
        const i = strength.findIndex((u) => u.slugs.some((s) => canonicalSlug(s) === canonicalSlug(r.slug)));
        if (i >= 0) strength.splice(i, 1);
        g.strength[d] = makeStrengthUnit(r.slug, `frozen:strength:${d}`);
      }
    }
  }
  return g;
}

/** Dropped / merged-away units whose identity the existing week holds (capped by its count). */
function removedExisting(set: ReducedSet, existing: Map<string, number[]>): number {
  const left = new Map<string, number>();
  existing.forEach((arr, k) => left.set(k, arr.reduce((a, b) => a + b, 0)));
  for (const u of [...set.runs, ...set.strength]) {
    for (const r of refOfUnit(u)) {
      const k = refKey(r);
      if (left.has(k)) left.set(k, left.get(k)! - 1);
    }
  }
  let n = 0;
  left.forEach((v) => (n += Math.max(0, v)));
  return n;
}

const refOfUnit = (u: Unit): SessionRef[] =>
  u.kind === 'run' ? [{ kind: 'run', slot: u.slot! }] : u.slugs.map((slug) => ({ kind: 'strength', slug }));

export function buildWeek(input: ScheduleEngineInput): WeekPlan {
  const priority = input.priority ?? DEFAULT_PRIORITY;
  const fromDow = input.history?.todayDow ?? 0;
  const av = resolveDays(input.availability, fromDow);
  const frozen = Array.from({ length: 7 }, (_, d) => d < fromDow);
  const plan = buildUnits(input, priority);
  const base = freezePast(input, frozen, plan.runUnits, plan.strengthUnits);
  const longRunTarget = longRunTargetDay(av.open, input.availability.preferredLongRunDay);

  const existing = existingCounts(input, frozen);
  const moveWeight =
    input.existing?.mode === 'add_track'
      ? W.S4_KEEP_DAYS_ADD_TRACK
      : input.existing?.source === 'system-default'
        ? W.S4_KEEP_DAYS_SYSTEM_DEFAULT
        : W.S4_KEEP_DAYS;

  let best: { res: SearchResult; set: ReducedSet } | null = null;
  for (let k = 0; k <= plan.ladder.length; k++) {
    const set = applyLadder(plan, k);
    // Removing a session the user already has costs at least as much as moving it (S4).
    const removal = existing ? moveWeight * removedExisting(set, existing) : 0;
    const extraCost = set.dropCost + removal;
    const bestTotal = best ? best.res.total : Infinity;
    if (extraCost > bestTotal) continue;
    const score: ScoreCtx = {
      priority,
      longRunDay: longRunTarget.day,
      existing,
      moveWeight,
      streakComfort: streakComfortOf(input.levels),
      totalSessions: set.runs.length + set.strength.length,
      frozen,
    };
    const res = searchWeek(
      set.runs,
      set.strength,
      {
        open: av.open,
        maxPerDay: input.availability.maxSessionsPerDay,
        maxTrainingDays: input.availability.maxTrainingDays,
        runCap: runStreakCap(input.levels.running),
        score,
        base,
      },
      extraCost,
      bestTotal,
    );
    if (res && (!best || res.total < best.res.total - 1e-9 || (Math.abs(res.total - best.res.total) <= 1e-9 && res.key < best.res.key))) {
      best = { res, set };
    }
  }

  const grid = best?.res.grid ?? base;
  const set = best?.set ?? applyLadder(plan, plan.ladder.length);
  const days = finalizeLayout(grid, { input, priority, av, frozen });
  const perDay = dayReasons(days, { av, longRunTarget });

  // ── week warnings ──
  const warnings: V2Reason[] = [];
  if (!best) warnings.push({ code: 'NO_VALID_WEEK' });
  if (best?.res.truncated) warnings.push({ code: 'SEARCH_TRUNCATED' });
  const strengthDays = grid.strength.filter(Boolean).length;
  const droppedStrength = set.dropped.filter((u) => u.kind === 'strength' && !u.overflow);
  const droppedRuns = set.dropped.filter((u) => u.kind === 'run');
  if (plan.floor > 0 && strengthDays < plan.floor) {
    warnings.push({ code: 'STRENGTH_FLOOR_UNMET_AVAILABILITY', days: strengthDays, floor: plan.floor });
    warnings.push({ code: 'OPTIONAL_MIDWEEK_MICRO_SESSION' });
  }
  if (!input.running && plan.hardSkillCount > 0 && strengthDays < plan.skillDaysRequired) {
    warnings.push({
      code: 'DAYS_BELOW_SKILL_MIN',
      skills: plan.hardSkillCount,
      required: plan.skillDaysRequired,
      available: av.open.filter(Boolean).length,
    });
  }
  if (droppedStrength.length) {
    const hasLong = grid.run.some((u) => isLongRun(u));
    const from = plan.strengthUnits.filter((u) => !u.overflow).length;
    warnings.push(hasLong ? { code: 'STRENGTH_REDUCED_LONG_RUN_PROTECTED' } : { code: 'STRENGTH_REDUCED', from, to: from - droppedStrength.length });
  }
  if (droppedRuns.length) {
    warnings.push({
      code: 'RUNNING_REDUCED',
      from: plan.runUnits.length,
      to: plan.runUnits.length - droppedRuns.length,
      dropped: droppedRuns.map((u) => u.slot!),
    });
  }
  if (set.merged.length) warnings.push({ code: 'STRENGTH_MERGED' });
  if (set.downgraded.length) warnings.push({ code: 'Q2_TO_EASY' });
  let streak = 0;
  let longest = 0;
  for (let d = 0; d < 7; d++) {
    streak = grid.run[d] || grid.strength[d] ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  if (longest > streakComfortOf(input.levels)) warnings.push({ code: 'LONG_TRAINING_STREAK', days: longest });
  const doubles = [0, 1, 2, 3, 4, 5, 6].filter((d) => grid.run[d] && grid.strength[d]);
  const freeLeft = [0, 1, 2, 3, 4, 5, 6].some((d) => av.open[d] && !grid.run[d] && !grid.strength[d]);
  if (doubles.length && !freeLeft) doubles.forEach((d) => warnings.push({ code: 'DOUBLE_ON_QUALITY_DAY', day: d }));
  const strengthDeload = input.strengthCycleWeek === 5;
  if (strengthDeload || input.running?.isDeloadWeek) {
    warnings.push({ code: 'DELOAD_WEEK', strength: strengthDeload, running: !!input.running?.isDeloadWeek });
  }
  if (input.strengthCycleWeek === 4 && (input.running?.phase === 'peak' || input.running?.phase === 'taper')) {
    warnings.push({ code: 'STRENGTH_PEAK_IN_RUN_PEAK', strengthWeek: 4, runWeek: 0 });
  }
  if (plan.travelWeek) warnings.push({ code: 'TRAVEL_WEEK' });
  if (input.walking?.dailyStepGoal) warnings.push({ code: 'STEPS_DAILY', goal: input.walking.dailyStepGoal });

  const dayPlans: DayPlan[] = days.map((sessions, d) => ({
    dow: d,
    available: av.open[d],
    sessions,
    reasons: perDay[d],
    reasonsHe: renderV2ReasonsHe(perDay[d]),
  }));

  return {
    priority,
    days: dayPlans,
    warnings,
    warningsHe: renderV2ReasonsHe(warnings),
    dropped: set.dropped.filter((u) => !u.overflow).flatMap(refOfUnit),
    diff: diffWeek(days, input.existing, av, frozen),
    penalty: best?.res.total ?? 0,
    penaltyBreakdown: best?.res.breakdown ?? {},
    hardViolations: [
      ...Array.from(new Set(
        checkHardRules(grid, { open: av.open, maxPerDay: input.availability.maxSessionsPerDay, maxTrainingDays: input.availability.maxTrainingDays, frozen }, input.levels.running).map(
          (v) => v.rule,
        ),
      )),
    ],
    searchTruncated: !!best?.res.truncated,
  };
}
