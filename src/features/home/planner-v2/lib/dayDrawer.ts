/**
 * Planner v2 (enable_week_builder_v1) — the day drawer's content: that day's two rings with
 * the minutes per track and steps vs goal (the Progress tab's visual language), the workouts
 * done (one row per saved workout — a combined workout's parts fold back into one) and the
 * sessions still planned (time + move when the schedule can be written for them). Pure.
 */
import { TRACK_COLORS, TRACK_ORDER, type TrackKey } from '@/components/ui/v2/track-colors';
import type { DayRings } from './dayRings';

export interface DoneWorkoutLike {
  id: string;
  /** Set on a part of a combined workout: the saved doc's id. */
  sessionId?: string;
  kind: 'strength' | 'run' | 'walk' | 'other';
  minutes: number;
  km: number;
  title?: string;
  date: Date;
}

export interface PlannedSessionLike {
  id: string;
  track: TrackKey;
  titleHe: string;
  detailHe: string | null;
  status?: 'done' | 'missed';
  locked?: boolean;
  /** Planner session data: the entries it is (none for a run of the running plan). */
  data?: { entryIds: string[]; programIds: string[]; date: string; startTime?: string | null };
}

export interface DayDrawerTrackRow {
  key: TrackKey;
  minutes: number;
  color: string;
}

export interface DayDrawerDone {
  /** The saved workout's doc id (tap → its summary). */
  workoutId: string;
  kinds: Array<DoneWorkoutLike['kind']>;
  title: string | null;
  minutes: number;
  km: number;
}

export interface DayDrawerPlanned {
  sessionId: string;
  track: TrackKey;
  titleHe: string;
  detailHe: string | null;
  time: string | null;
  /** The planned time can be written (an own schedule entry, or a template day to hydrate). */
  timeEditable: boolean;
  /** Can be moved to another day (not locked context). */
  movable: boolean;
}

export interface DayDrawerModel {
  iso: string;
  isToday: boolean;
  isPast: boolean;
  rings: DayRings;
  /** Every track, TRACK_ORDER — zero rows included so the legend never jumps. */
  tracks: DayDrawerTrackRow[];
  done: DayDrawerDone[];
  planned: DayDrawerPlanned[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One row per saved workout (combined parts folded), oldest first. */
export function doneRowsOf(workouts: readonly DoneWorkoutLike[]): DayDrawerDone[] {
  const byKey = new Map<string, DayDrawerDone & { at: number }>();
  for (const w of workouts) {
    const key = w.sessionId ?? w.id;
    const row = byKey.get(key) ?? { workoutId: key, kinds: [], title: w.title ?? null, minutes: 0, km: 0, at: w.date.getTime() };
    if (!row.kinds.includes(w.kind)) row.kinds.push(w.kind);
    row.minutes += Math.max(0, w.minutes || 0);
    row.km += Math.max(0, w.km || 0);
    row.title = row.title ?? w.title ?? null;
    byKey.set(key, row);
  }
  return Array.from(byKey.values())
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...r }) => ({ ...r, minutes: Math.round(r.minutes), km: round1(r.km) }));
}

export interface BuildDayDrawerInput {
  iso: string;
  todayKey: string;
  rings: DayRings;
  workouts: readonly DoneWorkoutLike[];
  /** The day's sessions from the planner week (usePlannerWeek). */
  sessions: readonly PlannedSessionLike[];
}

export function buildDayDrawer(i: BuildDayDrawerInput): DayDrawerModel {
  const isToday = i.iso === i.todayKey;
  const isPast = i.iso < i.todayKey;
  const planned = i.sessions
    .filter((s) => s.status !== 'done')
    .map((s) => ({
      sessionId: s.id,
      track: s.track,
      titleHe: s.titleHe,
      detailHe: s.detailHe,
      time: s.data?.startTime ?? null,
      timeEditable: !isPast && !!s.data && (s.data.entryIds.length > 0 || s.data.programIds.length > 0),
      movable: !s.locked,
    }));
  return {
    iso: i.iso,
    isToday,
    isPast,
    rings: i.rings,
    tracks: TRACK_ORDER.map((k) => ({ key: k, minutes: i.rings.minutes[k], color: TRACK_COLORS[k] })),
    done: doneRowsOf(i.workouts),
    planned,
  };
}
