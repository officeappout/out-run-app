/**
 * Week / day context for the v2 run preview and the weekly run list (pure).
 */
import { mapRunWeekFromLetters, type RunWeekMapOptions } from '@/features/schedule/utils/runWeekByType';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export interface RunWeekContext {
  week: number;
  /** The workout's slot in the week (schedule entry `day`, 1-based). */
  day?: number;
  totalWeeks?: number;
}

function positiveInt(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** From the map URL (`?week=3&day=2`); null when `week` is absent — the context is then simply not shown. */
export function parseRunWeekParams(
  week: string | null | undefined,
  day: string | null | undefined,
  totalWeeks?: number | null,
): RunWeekContext | null {
  const w = positiveInt(week);
  if (!w) return null;
  const d = positiveInt(day);
  const t = totalWeeks && totalWeeks > 0 ? Math.round(totalWeeks) : undefined;
  return { week: w, ...(d ? { day: d } : {}), ...(t && t >= w ? { totalWeeks: t } : {}) };
}

/** "שבוע 3 מתוך 8 · אימון 2 השבוע" (long) / "שבוע 3 · אימון 2" (short). */
export function runWeekContextLabel(ctx: RunWeekContext | null | undefined, { short = false } = {}): string {
  if (!ctx) return '';
  const week = short || !ctx.totalWeeks ? `שבוע ${ctx.week}` : `שבוע ${ctx.week} מתוך ${ctx.totalWeeks}`;
  if (!ctx.day) return week;
  return short ? `${week} · אימון ${ctx.day}` : `${week} · אימון ${ctx.day} השבוע`;
}

// ── Weekly run list ──────────────────────────────────────────────────────

export interface RunScheduleEntryLike {
  week: number;
  day: number;
  workoutId: string;
  status?: string;
  category?: string;
  workoutName?: string;
  slotType?: string;
  isQualityWorkout?: boolean;
}

export type RunWeekRowState = 'done' | 'skipped' | 'today' | 'upcoming';

export interface RunWeekRow<E extends RunScheduleEntryLike = RunScheduleEntryLike> {
  entry: E;
  state: RunWeekRowState;
  /** "ה׳" when the training days are known. */
  dayLetter: string | null;
}

function rowState(entry: RunScheduleEntryLike, opts: { targetDay?: number; isRunDay: boolean }): RunWeekRowState {
  if (entry.status === 'completed') return 'done';
  if (entry.status === 'skipped') return 'skipped';
  return opts.isRunDay && opts.targetDay === entry.day ? 'today' : 'upcoming';
}

/**
 * This week's entries in slot order. "today" = the entry the home card
 * targets (`targetDay`) on a run day; done / skipped from the stored status.
 * `placement.byType` (enable_home_v2): each run on its weekday by slot type
 * (runWeekByType — the signup placement), rows in weekday order.
 */
export function buildRunWeekRows<E extends RunScheduleEntryLike>(
  schedule: readonly E[] | null | undefined,
  week: number,
  scheduleDays: readonly string[],
  opts: { targetDay?: number; isRunDay: boolean; placement?: RunWeekMapOptions },
): RunWeekRow<E>[] {
  if (opts.placement?.byType) {
    const entries = (schedule ?? []).filter((e) => e.week === week).sort((a, b) => a.day - b.day);
    const dowOf = new Map<E, number>();
    mapRunWeekFromLetters(entries, scheduleDays, opts.placement).forEach((e, dow) => dowOf.set(e, dow));
    return entries
      .map((entry) => ({ entry, dow: dowOf.get(entry) }))
      .sort((a, b) => (a.dow ?? 7) - (b.dow ?? 7) || a.entry.day - b.entry.day)
      .map(({ entry, dow }) => ({
        entry,
        state: rowState(entry, opts),
        dayLetter: dow != null ? `${DAY_LETTERS[dow]}׳` : null,
      }));
  }
  const trainingDayIndices = scheduleDays
    .map((letter) => DAY_LETTERS.indexOf(letter))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  return (schedule ?? [])
    .filter((e) => e.week === week)
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((entry) => {
      const idx = trainingDayIndices[entry.day - 1];
      const state: RunWeekRowState =
        entry.status === 'completed'
          ? 'done'
          : entry.status === 'skipped'
            ? 'skipped'
            : opts.isRunDay && opts.targetDay === entry.day
              ? 'today'
              : 'upcoming';
      return { entry, state, dayLetter: idx != null ? `${DAY_LETTERS[idx]}׳` : null };
    });
}

export function runWeekSummary(rows: readonly RunWeekRow[]): { total: number; done: number; label: string } {
  const total = rows.length;
  const done = rows.filter((r) => r.state === 'done').length;
  return { total, done, label: `${done} מתוך ${total} בוצע` };
}
