/**
 * Home v2 (enable_home_v2) — run days on a strength-mode week strip
 * (SmartWeeklySchedule `runOverlayDays`, PERFORMANCE / DEFAULT dual-track).
 * The strip's own running mode re-keys the whole week to the running days;
 * the overlay keeps the strength week and only adds the runs:
 *  - strength day + run → unchanged here; the run joins the day's planned
 *    sessions (the strip's existing multi-session alternation).
 *  - run-only day (a strength rest day) → a training day with the run's icon.
 * Pure — the strip passes what it already has.
 */

export interface RunOverlayEntryLike {
  category?: string;
  status?: string;
}

export interface RunOverlayDayFields {
  isRest: boolean;
  /** Set only on a run-only day: the cell shows the run's icon. */
  runningCategory?: string;
}

export function runOverlayDayFields(
  isStrengthRest: boolean,
  runEntry: RunOverlayEntryLike | undefined,
): RunOverlayDayFields {
  if (!runEntry || !isStrengthRest) return { isRest: isStrengthRest };
  return { isRest: false, runningCategory: runEntry.category || 'easy_run' };
}

/** Maps the week's running entries (1-based `day` slots) onto weekday indices (0 = Sunday). */
export function mapRunEntriesToWeekdays<E extends { day: number }>(
  entries: readonly E[],
  runDayLetters: readonly string[],
  hebrewDays: readonly string[],
): Map<number, E> {
  const map = new Map<number, E>();
  const indices = runDayLetters
    .map((l) => hebrewDays.indexOf(l))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  for (const e of entries) {
    const idx = indices[e.day - 1];
    if (idx !== undefined) map.set(idx, e);
  }
  return map;
}
