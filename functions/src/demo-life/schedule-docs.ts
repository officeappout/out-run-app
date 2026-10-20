/**
 * userSchedule/{uid}_{date} for the live engine (pure transforms).
 *
 * The seed writes the engine-built schedule 14 days ahead. The live engine keeps that
 * horizon moving: each day it makes sure the day one week ahead exists, cloned from the
 * same weekday (the persona's week repeats — the same rule the seed used to build it),
 * and it marks an entry completed when the persona does the session — exactly what the
 * app writes for a real user (completed + completedWorkoutId).
 */
export const SCHEDULE_LOOKAHEAD_DAYS = 7;

type Entry = Record<string, unknown>;

/** Deep-replace a date key inside string values (entry ids carry the date). */
function swapDate(v: unknown, from: string, to: string): unknown {
  if (typeof v === 'string') return v.split(from).join(to);
  if (Array.isArray(v)) return v.map((x) => swapDate(x, from, to));
  if (v && typeof v === 'object' && !(v instanceof Date) && typeof (v as { toDate?: unknown }).toDate !== 'function') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, swapDate(x, from, to)]));
  }
  return v;
}

/** A week-later copy of a schedule day: same entries, the new date, nothing completed. */
export function rollForwardSchedule(source: Record<string, unknown>, fromDate: string, toDate: string, uid: string, now: Date): Record<string, unknown> | null {
  const entries = Array.isArray(source.entries) ? (source.entries as Entry[]) : [];
  if (!entries.length) return null;
  const next = entries.map((e) => {
    const copy = swapDate(e, fromDate, toDate) as Entry;
    copy.completed = false;
    delete copy.completedWorkoutId;
    return copy;
  });
  return { userId: uid, date: toDate, entries: next, isDemo: true, updatedAt: now };
}

/** Entry i (the session's index in its day) marked done; null when there is no such entry. */
export function markEntryCompleted(doc: Record<string, unknown>, index: number, workoutId: string | null): Entry[] | null {
  const entries = Array.isArray(doc.entries) ? (doc.entries as Entry[]) : [];
  if (index < 0 || index >= entries.length) return null;
  return entries.map((e, k) => (k === index ? { ...e, completed: true, ...(workoutId ? { completedWorkoutId: workoutId } : {}) } : e));
}
