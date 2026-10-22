/**
 * Planner v2 (enable_week_builder_v1) — the month strip's data: month sections of week rows,
 * each day a cell the icons view and the rings view both draw from. Pure.
 *
 * Icons view = the home strip's v2 day language (DayIconCellV2):
 *   done    — a finished workout (or a planned one marked done): flame(s) in the track tone
 *   planned — today / later with a session: a tile with the track icon (runs by run type)
 *   missed  — a past planned day without a workout: the quiet "Zz" (never "פספסת")
 *   rest    — nothing planned: "Zz"
 * plus the streak capsule over 2+ done days in a row (streakRuns — a single rest day between
 * two done days stays inside it). Rings view = buildDayRings per day.
 */
import { capsuleBackground, sortTones, streakRuns, type FlameTone, type StreakCell } from '@/components/ui/v2/streak';
import type { TrackKey } from '@/components/ui/v2/track-colors';
import { buildDayRings, dayMinutesByTrack, type DayActivityLike, type DayRings, type DayWorkoutLike } from './dayRings';

export type PlannerCellKind = 'done' | 'planned' | 'missed' | 'rest';

/** One planned session of a day (advisor materializePlanned + detectMissed, slimmed). */
export interface PlannedLike {
  date: string;
  kind: TrackKey;
  status: 'done' | 'missed' | 'today' | 'upcoming';
  /** Run: the plan's run category (easy_run, long_run, short_intervals …) — colours the icon. */
  runCategory?: string | null;
}

export interface PlannerDayCell {
  iso: string;
  day: number;
  isToday: boolean;
  isPast: boolean;
  kind: PlannerCellKind;
  /** Flame tones earned (done days), sorted. */
  tones: FlameTone[];
  /** Planned sessions not yet done (planned / missed days), in day order. */
  planned: Array<{ track: TrackKey; runCategory: string | null }>;
  rings: DayRings;
}

export interface PlannerCapsule {
  /** Inclusive weekday indexes (0 = Sunday). */
  from: number;
  to: number;
  background: string;
}

export interface PlannerWeekRow {
  /** The row's Sunday ('YYYY-MM-DD', may sit in the previous month). */
  sunday: string;
  /** 7 cells, Sunday first; null = a day outside this month. */
  cells: Array<PlannerDayCell | null>;
  capsules: PlannerCapsule[];
}

export interface PlannerMonthSection {
  /** 'YYYY-MM'. */
  key: string;
  year: number;
  /** 0-based. */
  month: number;
  rows: PlannerWeekRow[];
}

export interface BuildMonthsInput {
  months: ReadonlyArray<{ year: number; month: number }>;
  todayKey: string;
  planned: readonly PlannedLike[];
  workoutsByDate: Readonly<Record<string, readonly DayWorkoutLike[]>>;
  daysByDate: Readonly<Record<string, DayActivityLike | undefined>>;
  stepGoal: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKeyOf = (y: number, m: number, d: number): string => {
  const x = new Date(y, m, d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

const TONE_OF_KIND: Record<DayWorkoutLike['kind'], FlameTone> = { strength: 'strength', run: 'cardio', walk: 'steps', other: 'cardio' };
const TONE_OF_TRACK: Record<TrackKey, FlameTone> = { strength: 'strength', run: 'cardio', walk: 'steps' };

export function buildDayCell(
  iso: string,
  todayKey: string,
  planned: readonly PlannedLike[],
  workouts: readonly DayWorkoutLike[],
  day: DayActivityLike | undefined,
  stepGoal: number,
): PlannerDayCell {
  const isToday = iso === todayKey;
  const isPast = iso < todayKey;
  const tones = sortTones([
    ...workouts.map((w) => TONE_OF_KIND[w.kind]),
    ...planned.filter((p) => p.status === 'done').map((p) => TONE_OF_TRACK[p.kind]),
  ]);
  const open = planned.filter((p) => p.status !== 'done').map((p) => ({ track: p.kind, runCategory: p.runCategory ?? null }));
  let kind: PlannerCellKind;
  if (tones.length) kind = 'done';
  else if (open.length) kind = isPast ? 'missed' : 'planned';
  else kind = 'rest';
  const rings = buildDayRings({ minutes: dayMinutesByTrack(workouts, day), steps: day?.steps ?? 0, stepGoal });
  return { iso, day: Number(iso.slice(8, 10)), isToday, isPast, kind, tones, planned: open, rings };
}

const streakCellOf = (c: PlannerDayCell | null): StreakCell => (c?.kind === 'done' ? 'done' : c?.kind === 'rest' ? 'rest' : 'other');

/** The capsules of one week row (the home strip's StreakCapsules rule). */
export function rowCapsules(cells: ReadonlyArray<PlannerDayCell | null>): PlannerCapsule[] {
  return streakRuns(cells.map(streakCellOf)).map((r) => {
    const slice = cells.slice(r.from, r.to + 1);
    const tones = slice.map((c, k) => (c?.tones[0] ?? slice[k - 1]?.tones[0] ?? slice[k + 1]?.tones[0] ?? 'strength') as FlameTone);
    return { from: r.from, to: r.to, background: capsuleBackground(tones) };
  });
}

export function buildMonthSections(i: BuildMonthsInput): PlannerMonthSection[] {
  const plannedByDate = new Map<string, PlannedLike[]>();
  for (const p of i.planned) {
    const list = plannedByDate.get(p.date) ?? [];
    list.push(p);
    plannedByDate.set(p.date, list);
  }
  return i.months.map(({ year, month }) => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const rowCount = Math.ceil((lead + daysInMonth) / 7);
    const rows: PlannerWeekRow[] = [];
    for (let r = 0; r < rowCount; r++) {
      const cells: Array<PlannerDayCell | null> = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = r * 7 + dow - lead + 1;
        if (d < 1 || d > daysInMonth) {
          cells.push(null);
          continue;
        }
        const iso = dateKeyOf(year, month, d);
        cells.push(buildDayCell(iso, i.todayKey, plannedByDate.get(iso) ?? [], i.workoutsByDate[iso] ?? [], i.daysByDate[iso], i.stepGoal));
      }
      rows.push({ sunday: dateKeyOf(year, month, r * 7 - lead + 1), cells, capsules: rowCapsules(cells) });
    }
    return { key: `${year}-${pad(month + 1)}`, year, month, rows };
  });
}

/** The months the strip shows: the previous one, this one and the next (oldest first). */
export function stripMonths(today: Date, before = 1, after = 1): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  for (let k = -before; k <= after; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}
