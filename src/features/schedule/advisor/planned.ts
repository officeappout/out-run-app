/**
 * Planned entries, materialized VIRTUALLY (nothing is written): for each date, what the
 * user planned — the same layering the app uses to show a day:
 *   1. a userSchedule day doc with entries wins for that date (hydrateFromTemplate's rule);
 *      an explicit rest override means nothing is planned;
 *   2. otherwise the recurring template's strength ids for that weekday;
 *   3. running comes from running.activeProgram.schedule (week + 1-based slot → weekday via
 *      the sorted running.scheduleDays, the same formula weaverInput / running-day-resolution use).
 *      With `runsByType` (enable_home_v2) the week's runs take their weekday BY SLOT TYPE
 *      through the shared mapper (utils/runWeekByType — the same week home and signup show:
 *      the long run on running.longRunDay when set), so a planned / missed run (and the
 *      make-up offered for it) is the run home shows on that day. Off: unchanged.
 *   4. a planned walk in the doc (enable_home_v2's walking signup, plannedActivityOf) is its
 *      own 'walk' entry — never a run: it does not keep a running-plan run on a rest-override
 *      day, and a logged walk (workouts kind 'walk') marks it done.
 *
 * Then detectMissed joins them with the workouts collection by date + kind (bug #8): a
 * strength entry is DONE when a strength (or hybrid) workout exists that day, or the entry
 * itself is marked completed; nothing ever wrote `completed` for recurring strength days, so
 * the join is the only real signal. Pure: dates are 'YYYY-MM-DD' keys, never the clock.
 */
import { DAY_LETTERS } from '../types/smartSchedule.types';
import { classifyStrengthId, type ResolveSlug } from '../engine/strengthVocabulary';
import { calculateCurrentWeek } from '@/lib/running-current-week';
import { isDateWithinRunningPlan } from '@/lib/running-plan-date-range';
import { mapRunWeekByType, runPlacementOf } from '../utils/runWeekByType';
import { plannedActivityOf, walkGoalOf, walkNameHe } from './plannedActivity';
import type { ScheduleItemId } from '../types/smartSchedule.types';
import type {
  AdvisorProfile,
  AdvisorScheduleDay,
  AdvisorWorkout,
  PlannedEntry,
  PlannedKind,
  PlannedWithStatus,
} from './types';

// ── Date keys (UTC arithmetic on calendar keys — no time zone, no clock) ─────

const DAY_MS = 86_400_000;

export function keyToDate(key: string): Date {
  // Noon UTC: the same calendar day in every time zone the app runs in (Israel / UTC).
  return new Date(`${key}T12:00:00Z`);
}

export function dayOfWeekOfKey(key: string): number {
  return keyToDate(key).getUTCDay();
}

export function addDaysToKey(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Sunday-anchored week (7 keys) containing `key`. */
export function weekKeysOf(key: string): string[] {
  const start = addDaysToKey(key, -dayOfWeekOfKey(key));
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
}

export function keysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let k = fromKey; k <= toKey && out.length < 60; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}

// ── Materialization ──────────────────────────────────────────────────────────

const STRENGTH_CATEGORIES = new Set(['strength']);

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function strengthOf(ids: string[], resolveSlug?: ResolveSlug): { slugs: string[]; scheduleIds: ScheduleItemId[] } {
  const slugs: string[] = [];
  const scheduleIds: ScheduleItemId[] = [];
  for (const id of ids) {
    const c = classifyStrengthId(id, resolveSlug);
    if (!c.scheduleId) continue;
    if (c.slug && !slugs.includes(c.slug)) slugs.push(c.slug);
    if (!scheduleIds.includes(c.scheduleId)) scheduleIds.push(c.scheduleId);
  }
  return { slugs, scheduleIds };
}

function runningTrainingDays(profile: AdvisorProfile): number[] {
  return (profile.running?.scheduleDays ?? [])
    .map((letter) => DAY_LETTERS.indexOf(letter as (typeof DAY_LETTERS)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
}

export interface MaterializeOptions {
  /** enable_home_v2 — runs on their weekday by slot type (see the header). Omitted = ordinal. */
  runsByType?: boolean;
}

type RunEntry = NonNullable<NonNullable<AdvisorProfile['running']>['activeProgram']>['schedule'][number];

/** The plan entry the run on `dow` is, for the given week: by slot type, or the k-th run on the k-th day. */
function runEntryOn(profile: AdvisorProfile, week: number, dow: number, trainingDays: number[], byType: boolean): RunEntry | undefined {
  const schedule = profile.running?.activeProgram?.schedule ?? [];
  if (byType) {
    const weekEntries = schedule.filter((e) => e.week === week);
    return mapRunWeekByType(weekEntries, trainingDays, runPlacementOf(profile.running)).get(dow);
  }
  const slot = trainingDays.indexOf(dow);
  return schedule.find((e) => e.week === week && e.day === slot + 1);
}

/** The running plan entry for a calendar day, or null. */
function plannedRunFor(profile: AdvisorProfile, key: string, opts: MaterializeOptions = {}): PlannedEntry | null {
  const program = profile.running?.activeProgram;
  if (!profile.running?.isUnlocked || !program?.schedule?.length) return null;
  const at = keyToDate(key);
  if (!isDateWithinRunningPlan(program.startDate, at)) return null;
  const week = calculateCurrentWeek(program.startDate, at);
  const dow = dayOfWeekOfKey(key);
  const trainingDays = runningTrainingDays(profile);
  if (!trainingDays.includes(dow)) return null;
  const entry = runEntryOn(profile, week, dow, trainingDays, opts.runsByType === true);
  if (!entry || !entry.category) return null;
  return {
    date: key,
    dayOfWeek: dow,
    kind: 'run',
    source: 'running_plan',
    strengthSlugs: [],
    strengthIds: [],
    runRef: { week, day: entry.day, ...(entry.workoutId ? { workoutId: entry.workoutId } : {}) },
    runDay: { dayOfWeek: dow, category: entry.category, isQualityWorkout: entry.isQualityWorkout, slotType: entry.slotType },
    runName: entry.workoutName ?? null,
    completedAtSource: entry.status === 'completed',
  };
}

export function materializePlanned(
  profile: AdvisorProfile,
  keys: string[],
  scheduleDays: AdvisorScheduleDay[] | null,
  resolveSlug?: ResolveSlug,
  opts: MaterializeOptions = {},
): PlannedEntry[] {
  const byDate = new Map((scheduleDays ?? []).map((d) => [d.date, d]));
  const template = profile.lifestyle?.recurringTemplate ?? {};
  const out: PlannedEntry[] = [];

  for (const key of keys) {
    const dow = dayOfWeekOfKey(key);
    const doc = byDate.get(key);
    const docEntries = (doc?.entries ?? []).filter((e) => e && typeof e === 'object');
    let strengthPlanned: { slugs: string[]; scheduleIds: ScheduleItemId[]; completed: boolean } | null = null;
    let runFromDoc = false;
    let restOverride = false;
    let walkPlanned: { goal: ReturnType<typeof walkGoalOf>; completed: boolean } | null = null;

    if (docEntries.length > 0) {
      for (const e of docEntries) {
        if (e.type === 'rest') {
          if (e.override === true) restOverride = true;
          continue;
        }
        if (e.type !== 'training' || e.source === 'community') continue;
        const cats = strList(e.scheduledCategories);
        const s = strengthOf(strList(e.programIds), resolveSlug);
        const activity = plannedActivityOf(e);
        if (activity === 'walk') {
          // A planned walk is its own entry (one per day) — never a run, never runFromDoc.
          walkPlanned = walkPlanned ?? { goal: walkGoalOf(e.plannedRun), completed: false };
          if (e.completed === true) walkPlanned.completed = true;
          continue;
        }
        const isRun = activity === 'run';
        if (isRun) runFromDoc = true;
        if (s.scheduleIds.length > 0 || (cats.some((c) => STRENGTH_CATEGORIES.has(c)) && !isRun)) {
          strengthPlanned = strengthPlanned ?? { slugs: [], scheduleIds: [], completed: false };
          s.slugs.forEach((x) => !strengthPlanned!.slugs.includes(x) && strengthPlanned!.slugs.push(x));
          s.scheduleIds.forEach((x) => !strengthPlanned!.scheduleIds.includes(x) && strengthPlanned!.scheduleIds.push(x));
          if (e.completed === true) strengthPlanned.completed = true;
        }
      }
    } else {
      const ids = template[DAY_LETTERS[dow]];
      const s = strengthOf(Array.isArray(ids) ? ids : [], resolveSlug);
      if (s.scheduleIds.length > 0) strengthPlanned = { ...s, completed: false };
    }

    // An explicit rest override drops the template / running plan, never the doc's own
    // entries (strength, or a walk). Without a planned walk this is exactly the old rule.
    if (restOverride && !strengthPlanned && !walkPlanned) continue;

    if (strengthPlanned) {
      out.push({
        date: key,
        dayOfWeek: dow,
        kind: 'strength',
        source: docEntries.length > 0 ? 'override' : 'template',
        strengthSlugs: strengthPlanned.slugs,
        strengthIds: strengthPlanned.scheduleIds,
        runRef: null,
        runDay: null,
        runName: null,
        completedAtSource: strengthPlanned.completed,
      });
    }
    const run = plannedRunFor(profile, key, opts);
    if (run && !(restOverride && (!runFromDoc || !strengthPlanned))) out.push(run);
    if (walkPlanned) {
      out.push({
        date: key,
        dayOfWeek: dow,
        kind: 'walk',
        source: 'override',
        strengthSlugs: [],
        strengthIds: [],
        runRef: null,
        runDay: null,
        runName: walkNameHe(walkPlanned.goal),
        walkGoal: walkPlanned.goal,
        completedAtSource: walkPlanned.completed,
      });
    }
  }
  return out;
}

// ── Done / missed ────────────────────────────────────────────────────────────

export function workoutMatchesKind(w: AdvisorWorkout, kind: PlannedKind): boolean {
  if (w.kind === 'hybrid') return true;
  if (kind === 'walk') return w.kind === 'walk';
  return kind === 'strength' ? w.kind === 'strength' : w.kind === 'run';
}

/**
 * Joins planned entries with workouts by date + kind. Status:
 *   done      — a matching workout that day, or the entry is completed at its source
 *   today     — today's entry, not done yet
 *   missed    — a past entry with no matching workout
 *   upcoming  — after today
 */
export function detectMissed(planned: PlannedEntry[], workouts: AdvisorWorkout[], todayKey: string): PlannedWithStatus[] {
  return planned.map((p) => {
    const done = p.completedAtSource || workouts.some((w) => w.date === p.date && workoutMatchesKind(w, p.kind));
    const status = done ? 'done' : p.date === todayKey ? 'today' : p.date < todayKey ? 'missed' : 'upcoming';
    return { ...p, status };
  });
}
