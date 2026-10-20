/**
 * Weekly top-up of a walker's plan (enable_home_v2, owner 20.10.2026) — pure.
 *
 * The signup writes the walks a few weeks ahead (WALK_PLAN_CONFIG.horizonWeeks).
 * When the saved walks reach less than TOP_UP_AHEAD_DAYS ahead, the NEXT week is
 * computed with the same algorithm (buildWalkWeek, same config) from what is
 * actually saved and done — no stored goal/comfort fields exist, and none are added:
 *   - the template = the last saved week: its days, its time of day per day, its
 *     total minutes, time vs distance targets (all-distance = the "steps" goal);
 *   - the ramp, gentle (≤ weeklyRampCap):
 *       planned walks of the last 7 days mostly done (≥ 2/3)  → +10%, up to the WHO
 *         minimum (150′); at or above it → hold;
 *       mostly missed (< 1/3)                                → −10% (floor: the
 *         sedentary start minutes);
 *       otherwise → hold;
 *       no planned walk in the last 7 days → recent steps decide (adaptive step
 *         goal level moderate/active → the "done" rule, else hold).
 * Idempotent: deterministic walkplan_<date> ids; a date that already has this
 * flow's walk (done or not) is never touched.
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { WALK_PLAN_CONFIG, type WalkPlanConfig } from './walkPlan.config';
import { activityLevelFromStepGoal, buildWalkWeek } from './walkPlan';
import { isOwnWalkEntry, isPlannedWalkEntry } from './walkEntry';
import { isoDate, parseIso, walkEntryFor, type WalkDayWrite } from './walkSchedule';

/** Top up when the last saved walk is less than this many days ahead (~3 weeks). */
export const TOP_UP_AHEAD_DAYS = 21;

const round5 = (n: number) => Math.round(n / 5) * 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function sundayOf(iso: string): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() - d.getDay());
  return isoDate(d);
}

/** The read window: last week's Sunday → 6 weeks (covers the horizon + one more week). */
export function topUpReadDates(today: Date): string[] {
  const start = addDays(sundayOf(isoDate(today)), -7);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const isOwnWalk = (e: UserScheduleEntry) => isOwnWalkEntry(e) && isPlannedWalkEntry(e);

/** A walk entry's minutes (distance → minutes at the config's brisk pace). */
export function walkEntryMinutes(e: UserScheduleEntry, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  const goal = (e.plannedRun as { goal?: { type?: string; value?: number } } | undefined)?.goal;
  const v = Number(goal?.value) || 0;
  if (goal?.type === 'distance') return round5(v / cfg.kmPerMinute);
  return v;
}

export function nextWeeklyMinutes(
  lastTotal: number,
  adherence: number | null,
  stepGoal: number | null,
  cfg: WalkPlanConfig = WALK_PLAN_CONFIG,
): number {
  const grow = () => Math.max(lastTotal, Math.min(round5(lastTotal * (1 + cfg.weeklyRampCap)), cfg.who.minWeeklyMinutes));
  if (adherence === null) {
    const level = activityLevelFromStepGoal(stepGoal, cfg);
    return level === 'moderate' || level === 'active' ? grow() : lastTotal;
  }
  if (adherence >= 2 / 3) return grow();
  if (adherence < 1 / 3) return Math.max(cfg.startMinutesByLevel.sedentary, round5(lastTotal * (1 - cfg.weeklyRampCap)));
  return lastTotal;
}

export interface WalkTopUpInput {
  byDate: Readonly<Record<string, UserScheduleEntry[]>>;
  today: Date;
  uid: string;
  stepGoal: number | null;
  cfg?: WalkPlanConfig;
}

/** The next week's walks by date, or null (not this flow's walker / still far enough ahead). */
export function planWalkTopUp(input: WalkTopUpInput): Record<string, UserScheduleEntry> | null {
  const cfg = input.cfg ?? WALK_PLAN_CONFIG;
  const todayIso = isoDate(input.today);
  const walks = Object.values(input.byDate).flat().filter(isOwnWalk);
  if (!walks.length) return null;

  const lastDate = walks.reduce((m, w) => (w.date > m ? w.date : m), walks[0].date);
  const aheadDays = Math.round((parseIso(lastDate).getTime() - parseIso(todayIso).getTime()) / DAY_MS);
  if (aheadDays >= TOP_UP_AHEAD_DAYS) return null;

  // The template: the last saved week.
  const lastWeekStart = sundayOf(lastDate);
  const template = walks.filter((w) => w.date >= lastWeekStart && w.date <= addDays(lastWeekStart, 6));
  const days = Array.from(new Set(template.map((w) => parseIso(w.date).getDay()))).sort((a, b) => a - b);
  const timeByDow = new Map(template.map((w) => [parseIso(w.date).getDay(), w.startTime]));
  const lastTotal = template.reduce((s, w) => s + walkEntryMinutes(w, cfg), 0);
  const allDistance = template.every((w) => (w.plannedRun as { goal?: { type?: string } } | undefined)?.goal?.type === 'distance');

  // What actually happened: planned walks of the last 7 days.
  const weekAgo = addDays(todayIso, -7);
  const past = walks.filter((w) => w.date >= weekAgo && w.date < todayIso);
  const adherence = past.length ? past.filter((w) => w.completed === true).length / past.length : null;

  const total = nextWeeklyMinutes(lastTotal, adherence, input.stepGoal, cfg);
  const week = buildWalkWeek(0, total, days, allDistance ? 'steps' : 'health', cfg);

  const thisSunday = sundayOf(todayIso);
  const nextStart = addDays(lastWeekStart, 7) > thisSunday ? addDays(lastWeekStart, 7) : thisSunday;
  const out: Record<string, UserScheduleEntry> = {};
  for (const w of week.walks) {
    const date = addDays(nextStart, w.dow);
    if (date < todayIso) continue;
    const entry = walkEntryFor(date, w, undefined, input.uid);
    const startTime = timeByDow.get(w.dow) ?? template[0]?.startTime;
    out[date] = startTime ? { ...entry, startTime } : entry;
  }
  return Object.keys(out).length ? out : null;
}

/** Only ADD: each date's entries + the new walk; a date that already has this flow's walk is skipped. */
export function planTopUpDayWrites(
  existingByDate: Readonly<Record<string, UserScheduleEntry[]>>,
  walksByDate: Readonly<Record<string, UserScheduleEntry>>,
): WalkDayWrite[] {
  return Object.keys(walksByDate)
    .sort()
    .filter((date) => !(existingByDate[date] ?? []).some((e) => isOwnWalkEntry(e)))
    .map((date) => ({ date, entries: [...(existingByDate[date] ?? []), walksByDate[date]] }));
}

/** At most once a day per device (local guard value). */
export function topUpDueToday(lastRunIso: string | null, today: Date): boolean {
  return lastRunIso !== isoDate(today);
}
