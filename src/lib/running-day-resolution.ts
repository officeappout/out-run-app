import { isDateWithinRunningPlan } from './running-plan-date-range';
import { calculateCurrentWeek } from '@/features/workout-engine/core/services/workout-completion.service';

// Minimal structural type, not an import of NextRunWorkoutCard's own
// `ActiveRunningProgram.schedule` entry shape — src/lib/ shouldn't depend on
// a component file's type (same reasoning as running-onboarding-gate.ts's
// own GateProfile, running-today-workout.ts's own RunningWeekEntry). The
// caller's real schedule entries already satisfy this structurally.
export interface RunningScheduleEntry {
  week: number;
  day: number;
  status?: 'pending' | 'completed' | 'skipped' | 'swapped';
  workoutId?: string;
  workoutName?: string;
  category?: string;
}

/**
 * `'out-of-range'` — the requested date is provably before the plan even
 * started (`isDateWithinRunningPlan` failed). Distinct from `'none'`
 * (no schedule data for the date's resolved week — e.g. past the plan's
 * last week) — both mean "no program applies," but `'out-of-range'` is an
 * explicit boundary check, not just an absence of data. Neither is a rest
 * day: `isRunDay` is `false` for both, same as a genuine `'program'` rest
 * day, but callers that want to say "your plan hasn't started yet" instead
 * of "rest day" need `source` to tell the two apart.
 */
export type RunningDayStateSource = 'scheduleDays' | 'program' | 'none' | 'out-of-range';

export interface RunningDayState<T extends RunningScheduleEntry> {
  isRunDay: boolean;
  todayEntry: T | undefined;
  nextEntry: T | undefined;
  /** 1-7, "how many days from now." Only knowable when `scheduleDays`
   *  drives the lookup — a real weekday mapping exists. Undefined in the
   *  `'program'` fallback, where there is no weekday to count toward. */
  nextEntryDaysAway: number | undefined;
  source: RunningDayStateSource;
}

const DAY_TO_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

function isPendingEntry(entry: RunningScheduleEntry): boolean {
  return entry.status === 'pending' || !entry.status;
}

/**
 * The "is this date a run day, and which workout" decision behind
 * NextRunWorkoutCard, StatsOverview's RUNNING-mode branch, and
 * AgendaDayCard's per-day resolution — extracted (04.09.2026) because every
 * one of them asked `running.scheduleDays` alone, and a runner whose plan
 * was built (`activeProgram.schedule` has real, pending entries) but who
 * never reached the day-picker step (`scheduleDays` still empty) saw a
 * permanent "rest day," every day, forever — with no indication a real
 * program was sitting right there in Firestore.
 *
 * `isDateWithinRunningPlan(startDate, date)` (`running-plan-date-range.ts`,
 * from the earlier session's clamp fix) is checked FIRST, uniformly, before
 * either branch below — `'out-of-range'` if it fails. This used to live
 * only inside AgendaDayCard's own `resolveRunningEntry`, guarding just its
 * `scheduleDays` path (that consumer renders arbitrary past/future days, so
 * it needed the guard from day one; NextRunWorkoutCard/StatsOverview only
 * ever asked about "today," where a legitimately-created program's
 * `startDate` is always in the past, so the gap was latent, not live, until
 * a multi-date consumer got wired in). Consolidated here (05.09.2026) so
 * both branches share one check instead of `resolveRunningEntry`
 * duplicating it for one branch and `'program'` needing its own copy.
 *
 * The week used to look up `schedule` is derived from `date` itself via
 * `calculateCurrentWeek(startDate, date)` — not trusted from the caller's
 * `currentWeek` — so this answers correctly for any date, past, present, or
 * future, not just "today." `currentWeek` is kept only as the fallback when
 * `startDate` is unavailable.
 *
 * Decision rule, after the range check:
 * 1. `scheduleDays` non-empty → it is the source of truth: which weekday
 *    slot `date` falls on, matched against the resolved week's entries.
 * 2. `scheduleDays` empty but the resolved week has entries → the program is
 *    the source of truth. There is no weekday mapping to fall back on
 *    (schedule entries are positional slots, not calendar days), so "today"
 *    becomes "the first pending entry in that week" — and a week whose
 *    entries are all `completed`/`skipped` (nothing pending) is a genuine
 *    rest day per the program, not a permanent one.
 * 3. Neither → no plan applies to this date (`'none'` — this also covers a
 *    date past the plan's last real week, which resolves to a week number
 *    with no schedule entries, with no separate end-date check needed).
 *
 * Regression note: for the 3 originally-wired callers (NextRunWorkoutCard,
 * StatsOverview, both "today"-only), `calculateCurrentWeek(startDate)` with
 * no explicit `asOfDate` already equals `calculateCurrentWeek(startDate,
 * today)` — identical to what they were already passing as `currentWeek` —
 * so their output is unchanged. The uniform range check is also a no-op for
 * them: a legitimately-created program's `startDate` is always ≤ "today."
 */
export function resolveRunningDayState<T extends RunningScheduleEntry>(
  scheduleDays: string[],
  schedule: T[] | undefined,
  currentWeek: number,
  date: Date,
  startDate: Date | string | number | undefined,
): RunningDayState<T> {
  if (startDate && !isDateWithinRunningPlan(startDate, date)) {
    return {
      isRunDay: false,
      todayEntry: undefined,
      nextEntry: undefined,
      nextEntryDaysAway: undefined,
      source: 'out-of-range',
    };
  }

  const weekForDate = startDate ? calculateCurrentWeek(startDate, date) : currentWeek;
  const weekEntries = (schedule ?? []).filter((e) => e.week === weekForDate);

  if (scheduleDays.length > 0) {
    const trainingDayIndices = scheduleDays
      .map((letter) => DAY_TO_HE.indexOf(letter as (typeof DAY_TO_HE)[number]))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);

    const todayIdx = date.getDay();
    const todayHe = DAY_TO_HE[todayIdx];
    const isRunDay = scheduleDays.includes(todayHe);

    let todayEntry: T | undefined;
    for (const entry of weekEntries) {
      const slotIndex = entry.day - 1;
      const dayIdx = trainingDayIndices[slotIndex];
      if (dayIdx === todayIdx) {
        todayEntry = entry;
        break;
      }
    }

    let nextEntry: T | undefined;
    let nextEntryDaysAway: number | undefined;
    for (let offset = 1; offset <= 7; offset++) {
      const checkIdx = (todayIdx + offset) % 7;
      if (scheduleDays.includes(DAY_TO_HE[checkIdx])) {
        const slotIndex = trainingDayIndices.indexOf(checkIdx);
        nextEntry = slotIndex >= 0
          ? weekEntries.find((e) => e.day === slotIndex + 1)
          : undefined;
        nextEntryDaysAway = offset;
        break;
      }
    }

    return { isRunDay, todayEntry, nextEntry, nextEntryDaysAway, source: 'scheduleDays' };
  }

  if (weekEntries.length > 0) {
    const pending = weekEntries.filter(isPendingEntry).sort((a, b) => a.day - b.day);
    const todayEntry = pending[0];
    const nextEntry = pending[1];
    return {
      isRunDay: !!todayEntry,
      todayEntry,
      nextEntry,
      nextEntryDaysAway: undefined,
      source: 'program',
    };
  }

  return {
    isRunDay: false,
    todayEntry: undefined,
    nextEntry: undefined,
    nextEntryDaysAway: undefined,
    source: 'none',
  };
}
