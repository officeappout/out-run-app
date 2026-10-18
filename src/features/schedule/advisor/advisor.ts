/**
 * The schedule advisor — adviseWeek / adviseToday / detectMissed (re-exported).
 * Pure: no Firebase, no clock (todayKey is the only "now"), no React.
 *
 * adviseWeek runs the SAME rule families the builder drawer runs (buildWeaverInput →
 * weaveWeek), then layers periodization coordination on top: the strength 5-week cycle
 * (periodization.service's formula, clock passed in) against the running plan's phase.
 * adviseToday reads the materialized plan + the last 14 days of workouts and answers
 * "what now": strength / run / combined / walk / rest, with generator params or the run
 * entry, and typed reasons.
 */
import { buildWeaverInput, defaultWeaveControls, type WeaveControls } from '../engine/weaverInput';
import { weaveWeek } from '../engine/scheduleWeaver';
import { hasRunningTrack, hasStrengthTrack } from '@/lib/track-ownership';
import { resolveWeekForDate } from '@/lib/running-current-week';
import { derivePeriodizationWeekAt } from '@/features/workout-engine/services/periodization.service';
import { WHO_AEROBIC_TARGET_MIN, WHO_STRENGTH_TARGET_DAYS, RUNNING_MODERATE_EQUIV_FACTOR } from '@/lib/who-strength-target';
import { isLongRunDay, isQualityDay } from '../engine/runningRules';
import { dayLegLoad, classifyStrengthId } from '../engine/strengthVocabulary';
import {
  renderScheduleReasonsHe,
  sortScheduleReasons,
  type KeyRun,
  type ScheduleReason,
  type TodayKind,
} from '../engine/reasons';
import {
  addDaysToKey,
  dayOfWeekOfKey,
  detectMissed,
  keyToDate,
  keysBetween,
  materializePlanned,
  weekKeysOf,
  workoutMatchesKind,
} from './planned';
import { strengthIdsForNewDays } from './programTags';
import type {
  AdvisedDay,
  PlannedDay,
  TodayMode,
  AdvisorInput,
  GenerateParams,
  PeriodizationView,
  PlannedWithStatus,
  RunningPhase,
  TodayAdvice,
  WeekAdvice,
  WeeklyLoadView,
} from './types';

export { detectMissed } from './planned';

// ── Periodization ────────────────────────────────────────────────────────────

/**
 * Running phase of a plan week. The plan's real ProgramPhase list is NOT persisted on the
 * user (generatedProgramTemplate keeps only id / name / distance / weeks / frequency), so
 * this is a documented proportional reading of the same shape running-engine builds:
 * the last week of a goal plan is the taper, the two before it are the peak, the first
 * quarter is base, the rest build. A 'maintenance' plan has no peak.
 */
export function runningPhaseOf(week: number, totalWeeks: number, targetDistance?: string): RunningPhase {
  if (targetDistance === 'maintenance') return 'maintenance';
  if (totalWeeks < 4) return 'build';
  if (week >= totalWeeks) return 'taper';
  if (week >= totalWeeks - 2) return 'peak';
  if (week <= Math.max(1, Math.floor(totalWeeks / 4))) return 'base';
  return 'build';
}

function parseStart(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  const shape = raw as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof shape.toDate === 'function') return shape.toDate();
  const secs = shape.seconds ?? shape._seconds;
  if (typeof secs === 'number') return new Date(secs * 1000);
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function periodizationView(input: AdvisorInput): PeriodizationView {
  const at = keyToDate(input.todayKey);
  const profile = input.profile;
  const strengthStart = (profile.progression?.activePrograms ?? []).map((p) => parseStart(p.startDate)).find((d) => d) ?? null;
  const strengthWeek = strengthStart && hasStrengthTrack(profile) ? derivePeriodizationWeekAt({ startDate: strengthStart }, at) : null;

  const program = profile.running?.activeProgram;
  const runStart = program ? parseStart(program.startDate) : null;
  const runningWeek = runStart && hasRunningTrack(profile) ? resolveWeekForDate(runStart, at) : null;
  const total =
    profile.running?.generatedProgramTemplate?.canonicalWeeks ??
    (program?.schedule?.length ? Math.max(...program.schedule.map((e) => e.week)) : null);
  const runningTotalWeeks = runningWeek !== null && total ? total : null;
  const runningPhase =
    runningWeek !== null && runningTotalWeeks
      ? runningWeek > runningTotalWeeks
        ? null
        : runningPhaseOf(runningWeek, runningTotalWeeks, profile.running?.generatedProgramTemplate?.targetDistance)
      : null;

  return {
    strengthWeek,
    runningWeek: runningPhase ? runningWeek : null,
    runningTotalWeeks: runningPhase ? runningTotalWeeks : null,
    runningPhase,
    // Strength week 4 is its peak (+20% volume, periodization.service). Peaking strength in
    // a running peak week stacks two overloads: hold strength at a build week instead.
    strengthAdjustment: strengthWeek === 4 && runningPhase === 'peak' ? 'hold_build' : 'none',
  };
}

function periodizationReasons(p: PeriodizationView): ScheduleReason[] {
  const out: ScheduleReason[] = [];
  if (p.strengthAdjustment === 'hold_build' && p.strengthWeek !== null && p.runningWeek !== null) {
    out.push({ code: 'STRENGTH_PEAK_IN_RUN_PEAK', strengthWeek: p.strengthWeek, runWeek: p.runningWeek });
  } else if (p.runningPhase === 'peak' && p.runningWeek !== null) {
    out.push({ code: 'RUN_PEAK_WEEK', runWeek: p.runningWeek });
  }
  if (p.runningPhase === 'taper' && p.runningWeek !== null) out.push({ code: 'RUN_TAPER_WEEK', runWeek: p.runningWeek });
  if (p.strengthWeek === 5) out.push({ code: 'STRENGTH_DELOAD_WEEK' });
  return out;
}

// ── adviseWeek ───────────────────────────────────────────────────────────────

export function resolveControls(input: AdvisorInput): WeaveControls {
  const d = defaultWeaveControls(input.profile, { resolveSlug: input.resolveSlug });
  return { ...d, ...(input.controls ?? {}) };
}

/** null when the user owns neither track (nothing to advise). */
export function adviseWeek(input: AdvisorInput): WeekAdvice | null {
  const controls = resolveControls(input);
  const at = keyToDate(input.todayKey);
  const weaveInput = buildWeaverInput(input.profile, controls.mode, controls.focus, controls.availableDayCount, at, {
    resolveSlug: input.resolveSlug,
  });
  if (!weaveInput) return null;
  const woven = weaveWeek(weaveInput);
  const periodization = periodizationView(input);

  const extra: ScheduleReason[] = [...periodizationReasons(periodization)];
  if (controls.mode === 'running' && hasStrengthTrack(input.profile)) extra.push({ code: 'DOMAIN_EXCLUDED_BY_TAB', domain: 'strength' });
  if (controls.mode === 'strength' && hasRunningTrack(input.profile)) extra.push({ code: 'DOMAIN_EXCLUDED_BY_TAB', domain: 'running' });
  const reasons = sortScheduleReasons([...woven.reasons, ...extra]);

  // Every session carries the program it came from (multi-program weeks: e.g. an upper-body
  // program + a legs program + a 5K plan). Strength: the user's own stored ids of the
  // template day whose content this day carries (strengthIdsForNewDays — the same mapping
  // the save path writes); running: the active plan's id.
  const strengthProgramIds = strengthIdsForNewDays(input.profile, woven.week.strength, input.resolveSlug);
  const runProgramId = input.profile.running?.activeProgram?.programId ?? null;
  const days: AdvisedDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const s = woven.week.strength.find((d) => d.dayOfWeek === dayOfWeek);
    const r = woven.week.running.find((d) => d.dayOfWeek === dayOfWeek);
    const shared = woven.sharedDays.find((d) => d.dayOfWeek === dayOfWeek);
    const strength = (s?.sessions ?? []).map((x) => x.skillId);
    return {
      dayOfWeek,
      strength,
      strengthProgramIds: strength.length ? (strengthProgramIds.get(dayOfWeek) ?? []) : [],
      run:
        r && r.category !== null
          ? { category: r.category, ...(r.slotType ? { slotType: r.slotType } : {}), programId: runProgramId }
          : null,
      order: shared?.order ?? null,
    };
  });

  return {
    controls,
    week: woven.week,
    days,
    sharedDays: woven.sharedDays,
    reductions: woven.reductions,
    periodization,
    reasons,
    notes: renderScheduleReasonsHe(reasons),
  };
}

// ── adviseToday ──────────────────────────────────────────────────────────────

/** Schedule slug → generator domains (generate_workout's domain vocabulary). */
const SLUG_DOMAINS: Record<string, string[]> = {
  push: ['push'],
  pull: ['pull'],
  legs: ['legs'],
  core: ['core'],
  upper_body: ['push', 'pull'],
  calisthenics_upper: ['push', 'pull'],
  lower_body: ['legs'],
  full_body: [],
};

function domainsOf(slugs: string[]): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    const ds = SLUG_DOMAINS[slug] ?? [slug];
    for (const d of ds) if (!out.includes(d)) out.push(d);
  }
  return out;
}

export function weeklyLoadOf(input: AdvisorInput): WeeklyLoadView {
  const week = new Set(weekKeysOf(input.todayKey).filter((k) => k <= input.todayKey));
  const inWeek = input.workouts.filter((w) => week.has(w.date));
  const strengthDays = new Set(inWeek.filter((w) => workoutMatchesKind(w, 'strength')).map((w) => w.date));
  const aerobic = inWeek.reduce((sum, w) => {
    if (w.kind === 'run') return sum + w.minutes * RUNNING_MODERATE_EQUIV_FACTOR;
    if (w.kind === 'walk') return sum + w.minutes;
    return sum;
  }, 0);
  const sets = input.weeklyDomainSets;
  return {
    strengthDaysDone: strengthDays.size,
    strengthTarget: WHO_STRENGTH_TARGET_DAYS,
    aerobicModerateMin: Math.round(aerobic),
    aerobicTarget: WHO_AEROBIC_TARGET_MIN,
    neglectedDomains: sets ? ['push', 'pull', 'legs', 'core'].filter((d) => !(sets[d] > 0)) : null,
  };
}

function keyRunOf(p: PlannedWithStatus | undefined): KeyRun | null {
  if (!p?.runDay) return null;
  if (isLongRunDay(p.runDay)) return 'long';
  if (isQualityDay(p.runDay)) return 'quality';
  return null;
}

const daysBetweenKeys = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Makeup window: only a miss at most this many days old is ever offered. */
export const MAKEUP_MAX_AGE_DAYS = 2;
/** No workout for this many days → welcome_back; this many → fresh_start. */
export const WELCOME_BACK_GAP_DAYS = 4;
export const FRESH_START_GAP_DAYS = 7;

/**
 * Today's mode (owner policy, 18.10.2026: misses never become a backlog):
 *   - no workout for 7+ days (or none in the 14-day window while sessions were planned) → fresh_start
 *   - no workout for 4-6 days, or 2+ planned sessions missed in a row since the last
 *     workout → welcome_back
 *   - otherwise on_track (adviseToday may still turn it into 'makeup')
 */
export function resolveTodayMode(input: AdvisorInput, planned: PlannedWithStatus[]): Exclude<TodayMode, 'makeup'> {
  const today = input.todayKey;
  const active = input.workouts.map((w) => w.date).filter((d) => d <= today).sort();
  const last = active[active.length - 1] ?? null;
  if (last === null) {
    return planned.some((p) => p.status === 'missed') ? 'fresh_start' : 'on_track';
  }
  const gap = daysBetweenKeys(last, today);
  if (gap >= FRESH_START_GAP_DAYS) return 'fresh_start';
  if (gap >= WELCOME_BACK_GAP_DAYS) return 'welcome_back';
  const missedInARow = planned.filter((p) => p.status === 'missed' && p.date > last && p.date < today).length;
  return missedInARow >= 2 ? 'welcome_back' : 'on_track';
}

export function adviseToday(input: AdvisorInput): TodayAdvice {
  const today = input.todayKey;
  const windowKeys = keysBetween(addDaysToKey(today, -13), addDaysToKey(today, 1));
  const planned = detectMissed(materializePlanned(input.profile, windowKeys, input.scheduleDays, input.resolveSlug), input.workouts, today);
  const tomorrow = addDaysToKey(today, 1);
  const yesterday = addDaysToKey(today, -1);

  const todays = planned.filter((p) => p.date === today);
  const doneToday = {
    strength: input.workouts.some((w) => w.date === today && workoutMatchesKind(w, 'strength')),
    run: input.workouts.some((w) => w.date === today && workoutMatchesKind(w, 'run')),
  };
  const weeklyLoad = weeklyLoadOf(input);
  const periodization = periodizationView(input);
  const reasons: ScheduleReason[] = [];
  const baseMode = resolveTodayMode(input, planned);
  const light = baseMode !== 'on_track' || periodization.strengthWeek === 5;

  const tomorrowRun = planned.find((p) => p.date === tomorrow && p.kind === 'run');
  const keyRunTomorrow = keyRunOf(tomorrowRun);
  const yesterdayHard =
    input.workouts.some((w) => w.date === yesterday && (w.kind === 'strength' || w.kind === 'hybrid')) ||
    planned.some((p) => p.date === yesterday && p.kind === 'run' && p.status === 'done' && keyRunOf(p) !== null);

  const strengthParams = (slugs: string[]): GenerateParams => {
    let domains = domainsOf(slugs);
    if (keyRunTomorrow) {
      // R4 / R6b for today: no legs the day before a key run.
      domains = (domains.length ? domains : ['push', 'pull', 'legs', 'core']).filter((d) => d !== 'legs');
    }
    return { domains, difficulty: light ? 1 : 2, durationMin: baseMode === 'on_track' ? null : 20 };
  };
  const finish = (
    mode: TodayMode,
    recommendation: TodayKind,
    generateParams: GenerateParams | null,
    runEntryRef: TodayAdvice['runEntryRef'],
    extra: { makeup?: PlannedWithStatus | null; replan?: PlannedDay[] } = {},
  ): TodayAdvice => {
    const sorted = sortScheduleReasons(reasons);
    return {
      mode,
      recommendation,
      generateParams,
      runEntryRef,
      today: todays,
      doneToday,
      makeup: extra.makeup ?? null,
      replan: extra.replan ?? [],
      weeklyLoad,
      reasons: sorted,
      notes: renderScheduleReasonsHe(sorted),
    };
  };
  const activeProgramSlugs = () =>
    (input.profile.progression?.activePrograms ?? [])
      .map((p) => classifyStrengthId(p.templateId ?? p.id ?? '', input.resolveSlug).slug)
      .filter((x): x is string => !!x);

  // ── welcome_back / fresh_start: no "missed" framing, one light session, re-plan ──
  if (baseMode !== 'on_track') {
    reasons.push({ code: baseMode === 'fresh_start' ? 'FRESH_START' : 'WELCOME_BACK' });
    const week = adviseWeek(input);
    const span = baseMode === 'fresh_start' ? 7 : 7 - dayOfWeekOfKey(today);
    const replan: PlannedDay[] = Array.from({ length: span }, (_, i) => {
      const date = addDaysToKey(today, i);
      const d = week?.days.find((x) => x.dayOfWeek === dayOfWeekOfKey(date));
      return {
        date,
        dayOfWeek: dayOfWeekOfKey(date),
        strength: d?.strength ?? [],
        strengthProgramIds: d?.strengthProgramIds ?? [],
        run: d?.run ?? null,
        light: baseMode === 'fresh_start' || i === 0,
      };
    });
    if (doneToday.strength || doneToday.run) return finish(baseMode, 'rest', null, null, { replan });
    const plannedStrength = todays.find((p) => p.kind === 'strength');
    const plannedRun = todays.find((p) => p.kind === 'run');
    if (plannedStrength || (!plannedRun && hasStrengthTrack(input.profile))) {
      return finish(baseMode, 'strength', strengthParams(plannedStrength?.strengthSlugs ?? activeProgramSlugs()), null, { replan });
    }
    if (hasRunningTrack(input.profile)) {
      // A light run: today's planned run only when it is an easy one, else an easy run of one's own.
      const easy = plannedRun && !keyRunOf(plannedRun) ? plannedRun.runRef : null;
      return finish(baseMode, 'run', null, easy, { replan });
    }
    return finish(baseMode, 'walk', null, null, { replan });
  }

  // ── on_track: today's plan first ──
  for (const t of todays) {
    if (t.status === 'done') reasons.push({ code: 'TODAY_DONE', kind: t.kind === 'strength' ? 'strength' : 'run' });
  }
  const strengthToday = todays.find((p) => p.kind === 'strength' && p.status !== 'done');
  const runToday = todays.find((p) => p.kind === 'run' && p.status !== 'done');

  if (strengthToday && runToday) {
    reasons.push({ code: 'TODAY_PLANNED', kind: 'strength' }, { code: 'TODAY_PLANNED', kind: 'run' });
    if (keyRunOf(runToday) === 'quality') reasons.push({ code: 'QUALITY_RUN_FIRST', day: runToday.dayOfWeek });
    if (keyRunTomorrow) reasons.push({ code: 'KEY_RUN_TOMORROW', run: keyRunTomorrow });
    return finish('on_track', 'combined', strengthParams(strengthToday.strengthSlugs), runToday.runRef);
  }
  if (strengthToday) {
    reasons.push({ code: 'TODAY_PLANNED', kind: 'strength' });
    if (keyRunTomorrow && dayLegLoad(strengthToday.strengthIds.map((skillId) => ({ skillId }))) !== 'none') {
      reasons.push({ code: 'KEY_RUN_TOMORROW', run: keyRunTomorrow });
    }
    return finish('on_track', 'strength', strengthParams(strengthToday.strengthSlugs), null);
  }
  if (runToday) {
    reasons.push({ code: 'TODAY_PLANNED', kind: 'run' });
    return finish('on_track', 'run', null, runToday.runRef);
  }
  if (todays.length > 0) return finish('on_track', 'rest', null, null); // everything planned today is done

  // ── Nothing planned today (the week has room): at most ONE makeup — the most recent
  // miss, ≤2 days old, only if it breaks no recovery rule. Older misses are dropped. ──
  const lastMiss = planned
    .filter((p) => p.status === 'missed')
    .sort((a, b) => (a.date === b.date ? (a.kind === 'strength' ? 1 : -1) : a.date < b.date ? -1 : 1))
    .pop();
  const fresh = lastMiss && daysBetweenKeys(lastMiss.date, today) <= MAKEUP_MAX_AGE_DAYS;
  if (lastMiss && fresh) {
    const strengthYesterday = input.workouts.some((w) => w.date === yesterday && workoutMatchesKind(w, 'strength'));
    const ranYesterday = input.workouts.some((w) => w.date === yesterday && workoutMatchesKind(w, 'run'));
    const qualityNear = (lastMiss.runDay && isQualityDay(lastMiss.runDay)) &&
      planned.some((p) => p.kind === 'run' && (p.date === yesterday || p.date === tomorrow) && p.status !== 'missed' && keyRunOf(p) !== null);
    const strengthOk = lastMiss.kind === 'strength' && !strengthYesterday && !doneToday.strength;
    const runOk = lastMiss.kind === 'run' && !ranYesterday && !doneToday.run && !keyRunTomorrow && !qualityNear;
    if (strengthOk) {
      reasons.push({ code: 'MAKEUP_MISSED', kind: 'strength', day: lastMiss.dayOfWeek });
      if (keyRunTomorrow) reasons.push({ code: 'KEY_RUN_TOMORROW', run: keyRunTomorrow });
      return finish('makeup', 'strength', strengthParams(lastMiss.strengthSlugs), null, { makeup: lastMiss });
    }
    if (runOk) {
      reasons.push({ code: 'MAKEUP_MISSED', kind: 'run', day: lastMiss.dayOfWeek });
      return finish('makeup', 'run', null, lastMiss.runRef, { makeup: lastMiss });
    }
  }

  // WHO strength floor when the week is running out (no counting of misses, only of what was done).
  const strengthDoneYesterday = input.workouts.some((w) => w.date === yesterday && workoutMatchesKind(w, 'strength'));
  const daysLeft = 7 - dayOfWeekOfKey(today); // today included
  const whoGap = weeklyLoad.strengthTarget - weeklyLoad.strengthDaysDone;
  if (hasStrengthTrack(input.profile) && whoGap > 0 && daysLeft <= whoGap && !strengthDoneYesterday && !doneToday.strength) {
    reasons.push({ code: 'WHO_STRENGTH_GAP', done: weeklyLoad.strengthDaysDone, target: weeklyLoad.strengthTarget });
    return finish('on_track', 'strength', strengthParams(activeProgramSlugs()), null);
  }
  reasons.push({ code: 'REST_DAY' });
  if (yesterdayHard) reasons.push({ code: 'HARD_DAY_YESTERDAY' });
  // A light walk is the default "rest" for someone who trains; nothing after a workout already done today.
  const anyDoneToday = input.workouts.some((w) => w.date === today);
  return finish('on_track', anyDoneToday ? 'rest' : 'walk', null, null);
}
