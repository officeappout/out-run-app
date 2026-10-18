/**
 * Planned entries, materialized VIRTUALLY (nothing is written): for each date, what the
 * user planned — the same layering the app uses to show a day:
 *   1. a userSchedule day doc with entries wins for that date (hydrateFromTemplate's rule);
 *      an explicit rest override means nothing is planned;
 *   2. otherwise the recurring template's strength ids for that weekday;
 *   3. running comes from running.activeProgram.schedule (week + 1-based slot → weekday via
 *      the sorted running.scheduleDays, the same formula weaverInput / running-day-resolution use).
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
import type { ScheduleItemId } from '../types/smartSchedule.types';
import type {
  AdvisorProfile,
  AdvisorScheduleDay,
  AdvisorWorkout,
  PlannedEntry,
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
const RUN_CATEGORIES = new Set(['cardio']);

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

/** The running plan entry for a calendar day, or null. */
function plannedRunFor(profile: AdvisorProfile, key: string): PlannedEntry | null {
  const program = profile.running?.activeProgram;
  if (!profile.running?.isUnlocked || !program?.schedule?.length) return null;
  const at = keyToDate(key);
  if (!isDateWithinRunningPlan(program.startDate, at)) return null;
  const week = calculateCurrentWeek(program.startDate, at);
  const dow = dayOfWeekOfKey(key);
  const trainingDays = runningTrainingDays(profile);
  const slot = trainingDays.indexOf(dow);
  if (slot < 0) return null;
  const entry = program.schedule.find((e) => e.week === week && e.day === slot + 1);
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

    if (docEntries.length > 0) {
      for (const e of docEntries) {
        if (e.type === 'rest') {
          if (e.override === true) restOverride = true;
          continue;
        }
        if (e.type !== 'training' || e.source === 'community') continue;
        const cats = strList(e.scheduledCategories);
        const s = strengthOf(strList(e.programIds), resolveSlug);
        const isRun = !!e.plannedRun || cats.some((c) => RUN_CATEGORIES.has(c));
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

    if (restOverride && !strengthPlanned) continue;

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
    const run = plannedRunFor(profile, key);
    if (run && !(restOverride && !runFromDoc)) out.push(run);
  }
  return out;
}

// ── Done / missed ────────────────────────────────────────────────────────────

export function workoutMatchesKind(w: AdvisorWorkout, kind: 'strength' | 'run'): boolean {
  if (w.kind === 'hybrid') return true;
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
