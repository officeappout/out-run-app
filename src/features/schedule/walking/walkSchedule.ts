/**
 * Walking plan → the user's schedule (enable_home_v2). Pure.
 *
 * Storage decision (owner 20.10.2026: "least-invasive existing structure"): every
 * planned walk is an ordinary userSchedule/{uid}_{date} entry, using only fields the
 * entry type already has —
 *   type 'training' · source 'auto' · programIds [] · scheduledCategories ['walking']
 *   title "הליכה מהירה" · startTime (the chosen time of day)
 *   plannedRun { goal: time | distance }  ← the free walk player's own goal
 *   entryId "walkplan_<date>"             ← marks the entries this flow owns
 * The agenda already renders such an entry as "הליכה" with the walking icon; the
 * start action hands plannedRun to the free walk drawer (lib/planned-run.ts).
 * No new field, no new collection.
 */
import type { PlannedRunSettings } from '@/lib/planned-run';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import type { TimeWindow } from '../engine-v2/types';
import { RUN_TIME_PRESETS, DEFAULT_RUN_WINDOW } from '../utils/runWeekRecommendation';
import type { PlannedWalk, WalkPlan, WalkTarget } from './walkPlan.types';
import { WALK_ENTRY_PREFIX, isOwnWalkEntry } from './walkEntry';

export { WALK_ENTRY_PREFIX, isOwnWalkEntry, isPlannedWalkEntry } from './walkEntry';

export const WALK_TITLE_HE = 'הליכה מהירה';
export const LONG_WALK_TITLE_HE = 'הליכה ארוכה';

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function walkPlannedRun(target: WalkTarget): PlannedRunSettings {
  return {
    goal: target.type === 'time' ? { type: 'time', value: target.minutes } : { type: 'distance', value: target.km },
    route: { includeStrength: false, surface: 'road' },
  };
}

/**
 * The dates the plan covers: today → the end of week (horizonWeeks − 1), Sunday-based.
 * Each date carries its week index (0 = this week).
 */
export function walkHorizon(today: Date, horizonWeeks: number): Array<{ date: string; dow: number; week: number }> {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const sunday = new Date(start);
  sunday.setDate(start.getDate() - start.getDay());
  const out: Array<{ date: string; dow: number; week: number }> = [];
  for (let i = 0; i < horizonWeeks * 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    if (d < start) continue;
    out.push({ date: isoDate(d), dow: d.getDay(), week: Math.floor(i / 7) });
  }
  return out;
}

export function walkStartTime(window: TimeWindow | undefined): string {
  return RUN_TIME_PRESETS[window ?? DEFAULT_RUN_WINDOW].time;
}

export function walkEntryFor(date: string, walk: PlannedWalk, window: TimeWindow | undefined, uid: string): UserScheduleEntry {
  return {
    entryId: `${WALK_ENTRY_PREFIX}${date}`,
    userId: uid,
    date,
    programIds: [],
    type: 'training',
    source: 'auto',
    completed: false,
    title: walk.isLong ? LONG_WALK_TITLE_HE : WALK_TITLE_HE,
    scheduledCategories: ['walking'],
    startTime: walkStartTime(window),
    plannedRun: walkPlannedRun(walk.target),
  };
}

/** Every planned walk of the horizon as a schedule entry, by date. */
export function buildWalkEntries(
  plan: WalkPlan,
  windows: Partial<Record<number, TimeWindow>>,
  today: Date,
  uid: string,
): Record<string, UserScheduleEntry> {
  const out: Record<string, UserScheduleEntry> = {};
  for (const { date, dow, week } of walkHorizon(today, plan.weeks.length)) {
    const w = plan.weeks[week]?.walks.find((x) => x.dow === dow);
    if (w) out[date] = walkEntryFor(date, w, windows[dow], uid);
  }
  return out;
}

export interface WalkDayWrite {
  date: string;
  entries: UserScheduleEntry[];
}

/**
 * Per horizon date: the day's entries with this flow's old walk replaced by the new
 * one (every other entry kept as is). Dates that would not change are left out.
 */
export function planWalkDayWrites(
  existingByDate: Readonly<Record<string, UserScheduleEntry[]>>,
  walksByDate: Readonly<Record<string, UserScheduleEntry>>,
  horizonDates: readonly string[],
): WalkDayWrite[] {
  const out: WalkDayWrite[] = [];
  for (const date of horizonDates) {
    const existing = existingByDate[date] ?? [];
    const kept = existing.filter((e) => !isOwnWalkEntry(e));
    const walk = walksByDate[date];
    if (!walk && kept.length === existing.length) continue;
    out.push({ date, entries: walk ? [...kept, walk] : kept });
  }
  return out;
}

/** Dates that get a walk but have no day doc yet, on a weekday the recurring template covers. */
export function datesNeedingHydration(
  existingByDate: Readonly<Record<string, UserScheduleEntry[]>>,
  walksByDate: Readonly<Record<string, UserScheduleEntry>>,
  templateLetters: ReadonlySet<string>,
): string[] {
  const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  return Object.keys(walksByDate).filter(
    (date) => !(existingByDate[date]?.length) && templateLetters.has(LETTERS[parseIso(date).getDay()]),
  );
}
