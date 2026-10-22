/**
 * Planner v2 (enable_week_builder_v1) — a session's planned time ("שעה מתוכננת"). Pure.
 *
 * Stored in the EXISTING userSchedule entry field `startTime` ('HH:MM', 24h — see
 * UserScheduleEntry). No new field. The picker offers whole hours and quarter hours; a stored
 * time off the quarter grid is shown as is and snaps only when the user picks.
 *
 * Note: hydrateFromTemplate stamps a template day's entries with the user's reminder time
 * (or 07:00), so most strength days already carry a time.
 */

export const PLANNED_TIME_MINUTE_STEP = 15;

export const PLANNED_HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);
export const PLANNED_MINUTES: readonly number[] = Array.from({ length: 60 / PLANNED_TIME_MINUTE_STEP }, (_, k) => k * PLANNED_TIME_MINUTE_STEP);

export interface PlannedTime {
  h: number;
  m: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM' / 'H:MM' → { h, m }; null when absent or not a valid time. */
export function parsePlannedTime(v: unknown): PlannedTime | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function formatPlannedTime(t: PlannedTime): string {
  return `${pad(t.h)}:${pad(t.m)}`;
}

/** The nearest quarter hour, carrying into the next hour (23:53 → 23:45, never 24:00). */
export function snapToQuarter(t: PlannedTime): PlannedTime {
  const q = Math.round(t.m / PLANNED_TIME_MINUTE_STEP) * PLANNED_TIME_MINUTE_STEP;
  if (q < 60) return { h: t.h, m: q };
  return t.h >= 23 ? { h: 23, m: 60 - PLANNED_TIME_MINUTE_STEP } : { h: t.h + 1, m: 0 };
}

/** The wheel's starting value: the stored time snapped, else `fallback` (the reminder time), else 07:00. */
export function initialWheelTime(stored: unknown, fallback?: unknown): PlannedTime {
  const t = parsePlannedTime(stored) ?? parsePlannedTime(fallback) ?? { h: 7, m: 0 };
  return snapToQuarter(t);
}

/** The display time of a session's entries: the first valid startTime, normalized; null = none. */
export function sessionTimeOf(entries: ReadonlyArray<object>): string | null {
  for (const e of entries) {
    const t = parsePlannedTime((e as { startTime?: unknown }).startTime);
    if (t) return formatPlannedTime(t);
  }
  return null;
}

export interface TimedEntryLike {
  entryId?: string;
  type?: unknown;
  source?: unknown;
  programIds?: unknown;
  startTime?: string;
}

/**
 * The day's entries a planned time is written to: the session's own entries by id; with no
 * ids (a template day hydrated just now), the day's own training entries that train the
 * session's programs. Community entries are never touched.
 */
export function entriesToTime<E extends TimedEntryLike>(dayEntries: readonly E[], entryIds: readonly string[], programIds: readonly string[]): E[] {
  const own = dayEntries.filter((e) => e.source !== 'community' && e.type === 'training');
  if (entryIds.length) return own.filter((e) => !!e.entryId && entryIds.includes(e.entryId));
  const ids = new Set(programIds);
  return own.filter((e) => Array.isArray(e.programIds) && e.programIds.some((p) => typeof p === 'string' && ids.has(p)));
}

/** The entry with its planned time set (the existing `startTime` field) — everything else kept. */
export function withPlannedTime<E extends TimedEntryLike>(entry: E, t: PlannedTime): E {
  return { ...entry, startTime: formatPlannedTime(t) };
}
