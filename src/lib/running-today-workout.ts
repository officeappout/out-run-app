// Minimal structural type, not an import of SmartWeeklySchedule's
// RunningScheduleEntry — src/lib/ shouldn't depend on a component file's
// type (same reasoning as running-onboarding-gate.ts's own GateProfile).
// The caller's real RunningScheduleEntry (SmartWeeklySchedule.tsx) already
// satisfies this structurally; nothing here needs its other fields.
export interface RunningWeekEntry {
  day: number;
  status?: 'pending' | 'completed' | 'skipped' | 'swapped';
}

export interface ResolveTodayRunningWorkoutResult<T extends RunningWeekEntry> {
  todayEntry: T | undefined;
  isRestDay: boolean;
  nextUpEntry: T | undefined;
}

/**
 * The today/rest-day decision behind SmartWeeklySchedule's RunningWorkoutCards
 * — extracted (02.09.2026, A2 fix) so it's unit-testable (that component has
 * no jsdom coverage) and because the bug this closes needed a real test to
 * prove it, not just a comment's promise.
 *
 * `todayScheduleDay` is `undefined`/`null` in exactly one real case: today
 * genuinely isn't one of the user's scheduled running days — a real rest
 * day. The bug this fixes: the original code had a second branch here —
 * `entries.find(pending)` when `todayScheduleDay` was nullish — that
 * silently substituted an unrelated day's entry (whichever was first
 * pending in the week) and reported `isRestDay=false`, so the rest-day
 * card (already fully built in the caller) could never actually render.
 * `todayScheduleDay` being nullish IS "today is a rest day" — there is no
 * second, different reason it would be nullish that needs a fallback.
 *
 * When today has a real entry: `nextUpEntry` is always `undefined` (no
 * "next" line needed, the primary card already shows today's workout).
 * When today is a rest day: `nextUpEntry` is the week's first pending
 * entry, if any — `undefined` when the whole week's already completed
 * (an honest "nothing left to preview," not a bug).
 */
export function resolveTodayRunningWorkout<T extends RunningWeekEntry>(
  entries: T[],
  todayScheduleDay: number | null | undefined,
): ResolveTodayRunningWorkoutResult<T> {
  const todayEntry = todayScheduleDay != null
    ? entries.find((e) => e.day === todayScheduleDay && (e.status === 'pending' || !e.status))
    : undefined;

  const nextUpEntry = todayEntry
    ? undefined
    : entries.find((e) => e.status === 'pending' || !e.status);

  const isRestDay = !todayEntry;

  return { todayEntry, isRestDay, nextUpEntry };
}
