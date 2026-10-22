/**
 * Planner week (enable_week_builder_v1, phase 2) — one DATED week of the big schedule as a
 * week builder week. Not the recurring template: the week the user sees in the planner, the
 * same layering the app uses to show a day (advisor/planned.materializePlanned: the
 * userSchedule day docs over the template, runs from the running plan, planned walks) joined
 * with the week's finished workouts (detectMissed).
 *
 *   past days   — never a drop target; done sessions are locked ("בוצע"), missed ones stay
 *                 movable ("פוספס") so they can go to a day that is still ahead
 *   today, later — editable
 *   runs        — locked context: a run's day comes from the running plan's weekdays, which
 *                 has no per-date override to write to (phase 2 moves strength + walks only)
 *
 * Every editable session carries the userSchedule entries it is (entryIds) — none for a
 * template day that has no doc yet (the save hydrates it first). Pure.
 */
import { materializePlanned, detectMissed } from '../../advisor';
import { plannedActivityOf } from '../../advisor/plannedActivity';
import type { AdvisorProfile, AdvisorScheduleDay, AdvisorWorkout, PlannedWithStatus } from '../../advisor/types';
import { canonicalSlug } from '../../engine-v2/programProfiles';
import type { TimeWindow } from '../../engine-v2/types';
import { classifyStrengthId, scheduleIdNameHe, type ResolveSlug } from '../../engine/strengthVocabulary';
import { DAY_LETTERS } from '../../types/smartSchedule.types';
import { DEFAULT_RUN_WINDOW, windowOfTime } from '../../utils/runWeekRecommendation';
import { runPlacementOf, slotsOfEntries } from '../../utils/runWeekByType';
import { DEFAULT_STRENGTH_WINDOW } from '../../utils/strengthWeekRecommendation';
import { detailLineHe, emptyWeek, runMinutes, runTitleHe } from '../adapters/shared';
import { explainWeek } from '../explain';
import type { WbRules, WbSession, WbTrack, WbWeek } from '../types';

export interface PlannerWbData {
  kind: 'strength' | 'walk';
  /** The date the session sits on in the saved schedule ('YYYY-MM-DD'). */
  date: string;
  /** Its userSchedule entries; [] = a template day without a doc yet. */
  entryIds: string[];
  /** The ids it trains (entry programIds, or the template's strength ids). */
  programIds: string[];
}

export type PlannerWeek = WbWeek<PlannerWbData>;

export interface PlannerWeekInput {
  /** The week's 7 date keys, Sunday first. */
  keys: readonly string[];
  todayKey: string;
  profile: AdvisorProfile;
  /** userSchedule docs of the week (date → entries); a date without a doc is absent. */
  entriesByDate: Record<string, ReadonlyArray<AdvisorScheduleDay['entries'][number] & { entryId?: string }>>;
  workouts: AdvisorWorkout[];
  resolveSlug?: ResolveSlug;
  runsByType?: boolean;
}

export interface PlannerWeekModel {
  week: PlannerWeek;
  rules: WbRules;
  /** Day of month per weekday. */
  dates: number[];
  /** Planned sessions of past days that did not happen (movable). */
  missedCount: number;
}

type Entry = PlannerWeekInput['entriesByDate'][string][number];

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function isStrengthEntry(e: Entry, resolveSlug?: ResolveSlug): boolean {
  if (e.type !== 'training' || e.source === 'community' || plannedActivityOf(e) !== null) return false;
  if (strList(e.programIds).some((id) => classifyStrengthId(id, resolveSlug).scheduleId)) return true;
  return strList(e.scheduledCategories).includes('strength');
}

const isWalkEntry = (e: Entry): boolean => e.type === 'training' && e.source !== 'community' && plannedActivityOf(e) === 'walk';

function idsOf(entries: readonly Entry[]): { entryIds: string[]; programIds: string[] } {
  const entryIds = entries.map((e) => e.entryId).filter((x): x is string => typeof x === 'string' && !!x);
  const programIds = Array.from(new Set(entries.flatMap((e) => strList(e.programIds))));
  return { entryIds, programIds };
}

function windowsOf(profile: AdvisorProfile): { strength: TimeWindow; run: TimeWindow } {
  const r = (profile as { lifestyle?: { reminders?: { strengthTime?: string; runningTime?: string } } }).lifestyle?.reminders;
  return {
    strength: windowOfTime(r?.strengthTime) ?? DEFAULT_STRENGTH_WINDOW,
    run: windowOfTime(r?.runningTime) ?? DEFAULT_RUN_WINDOW,
  };
}

const statusOf = (p: PlannedWithStatus): WbSession['status'] => (p.status === 'done' ? 'done' : p.status === 'missed' ? 'missed' : undefined);

export function buildPlannerWeek(i: PlannerWeekInput): PlannerWeekModel {
  const keys = [...i.keys];
  const scheduleDays: AdvisorScheduleDay[] = Object.entries(i.entriesByDate).map(([date, entries]) => ({ date, entries: [...entries] }));
  const planned = detectMissed(materializePlanned(i.profile, keys, scheduleDays, i.resolveSlug, { runsByType: i.runsByType }), i.workouts, i.todayKey);
  const windows = windowsOf(i.profile);
  const placement = runPlacementOf(i.profile.running);
  const template = i.profile.lifestyle?.recurringTemplate ?? {};

  const week = emptyWeek<PlannerWbData>([0, 1, 2, 3, 4, 5, 6], {}, windows.strength);
  keys.forEach((key, dow) => {
    week.days[dow].past = key < i.todayKey;
    week.days[dow].open = key >= i.todayKey;
  });

  const runs = planned.filter((p) => p.kind === 'run' && p.runDay);
  const runSlots = slotsOfEntries(runs.map((p) => ({ day: p.runRef?.day ?? 0, category: p.runDay!.category ?? undefined, isQualityWorkout: p.runDay!.isQualityWorkout, slotType: p.runDay!.slotType })));

  for (const p of planned) {
    const dow = keys.indexOf(p.date);
    if (dow < 0) continue;
    const day = week.days[dow];
    const status = statusOf(p);
    const docEntries = i.entriesByDate[p.date] ?? [];
    let session: WbSession<PlannerWbData>;
    if (p.kind === 'run') {
      const slot = runSlots[runs.indexOf(p)] ?? 'easy_run';
      const minutes = runMinutes(slot);
      day.window = windows.run;
      session = {
        id: `run-${p.date}`,
        track: 'run',
        slot,
        titleHe: runTitleHe(slot, placement.level ?? null, p.runRef?.week ?? 1),
        detailHe: detailLineHe(minutes, windows.run),
        minutes,
        locked: true,
        homeDow: dow,
        status,
      };
    } else if (p.kind === 'strength') {
      const fromDoc = idsOf(docEntries.filter((e) => isStrengthEntry(e, i.resolveSlug)));
      const programIds = fromDoc.programIds.length
        ? fromDoc.programIds
        : strList(template[DAY_LETTERS[dow]]).filter((id) => classifyStrengthId(id, i.resolveSlug).scheduleId);
      session = {
        id: `strength-${p.date}`,
        track: 'strength',
        slug: canonicalSlug(p.strengthSlugs[0] ?? 'full_body'),
        titleHe: p.strengthIds.map(scheduleIdNameHe).join(' + ') || scheduleIdNameHe('FULL_BODY'),
        detailHe: detailLineHe(undefined, windows.strength),
        locked: status === 'done',
        homeDow: dow,
        status,
        data: { kind: 'strength', date: p.date, entryIds: fromDoc.entryIds, programIds },
      };
    } else {
      const minutes = p.walkGoal?.type === 'time' ? p.walkGoal.value : undefined;
      session = {
        id: `walk-${p.date}`,
        track: 'walk' as WbTrack,
        titleHe: p.runName ?? '',
        detailHe: detailLineHe(minutes, windows.run),
        minutes,
        locked: status === 'done',
        homeDow: dow,
        status,
        data: { kind: 'walk', date: p.date, ...idsOf(docEntries.filter(isWalkEntry)) },
      };
    }
    // Nothing to write a move to (no entry, no template ids) → locked context.
    if (session.data && session.data.entryIds.length === 0 && session.data.programIds.length === 0) session.locked = true;
    day.sessions.push(session);
  }

  const tracks = new Set(week.days.flatMap((d) => d.sessions.map((s) => s.track)));
  const rules: WbRules = {
    maxPerDay: tracks.size > 1 ? 2 : 1,
    runLevel: tracks.has('run') ? placement.level ?? null : null,
    preferredLongRunDay: placement.preferredLongRunDay ?? null,
  };
  const dates = keys.map((k) => Number(k.slice(8, 10)));
  const missedCount = week.days.reduce((n, d) => n + d.sessions.filter((s) => d.past && s.status === 'missed' && !s.locked).length, 0);
  return { week: explainWeek(week, rules), rules, dates, missedCount };
}

/** After a move: a session that left its past day is a planned one again (no status). */
export function settleStatus(week: PlannerWeek): PlannerWeek {
  let changed = false;
  const days = week.days.map((day) => {
    if (day.past || !day.sessions.some((s) => s.status === 'missed')) return day;
    changed = true;
    return { ...day, sessions: day.sessions.map((s) => (s.status === 'missed' ? { ...s, status: undefined } : s)) };
  });
  return changed ? { ...week, days } : week;
}
