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
 * The "is today a run day, and which workout" decision behind
 * NextRunWorkoutCard and StatsOverview's RUNNING-mode branch — extracted
 * (04.09.2026) because both components asked `running.scheduleDays` alone,
 * and a runner whose plan was built (`activeProgram.schedule` has real,
 * pending entries) but who never reached the day-picker step (`scheduleDays`
 * still empty) saw a permanent "rest day" card, every day, forever — with no
 * indication a real program was sitting right there in Firestore.
 *
 * Decision rule, in order:
 * 1. `scheduleDays` non-empty → it is the source of truth, byte-identical to
 *    the pre-existing weekday-lookup behavior (still keyed by `currentWeek`,
 *    the caller's own "which week" answer — this branch only ever gets
 *    asked about "today" by its 3 live callers, so it does not need its own
 *    date-derived week). Never touched by the 05.09.2026 date-scoping fix.
 * 2. `scheduleDays` empty but `schedule` has entries for the week `date`
 *    itself resolves to → the program is the source of truth. There is no
 *    weekday mapping to fall back on (schedule entries are positional
 *    slots, not calendar days), so "today" becomes "the first pending entry
 *    in that week" — and a week whose entries are all `completed`/
 *    `skipped` (nothing pending) is a genuine rest day per the program, not
 *    a permanent one.
 *    ⚠️ 05.09.2026 fix: this branch used to trust the caller's `currentWeek`
 *    directly, with no check that `date` actually falls within the plan's
 *    real range. `calculateCurrentWeek`'s own `Math.max(1,...)` clamp maps
 *    any date before `startDate` to week 1 — a REAL week, with genuinely
 *    `pending` entries (nothing has happened yet) — so a date before the
 *    plan even began would have silently returned week 1's workout as
 *    "today's." Now: `isDateWithinRunningPlan(startDate, date)` is checked
 *    FIRST (source `'out-of-range'` if it fails), and the week used to
 *    filter `schedule` is derived from `date` itself via
 *    `calculateCurrentWeek(startDate, date)` — not from `currentWeek` — so
 *    this branch answers correctly for any date a caller asks about, past,
 *    present, or future (a date past the plan's last real week naturally
 *    resolves to a week with no schedule entries, source `'none'`).
 * 3. Both empty → no plan exists at all; the pre-existing "no schedule"
 *    fallback state is preserved untouched.
 *
 * `currentWeek` is kept as a parameter for the `scheduleDays` branch and as
 * the fallback when `startDate` is unavailable in the `'program'` branch —
 * but the `'program'` branch never trusts it as the *only* source once
 * `startDate` is present.
 */
export function resolveRunningDayState<T extends RunningScheduleEntry>(
  scheduleDays: string[],
  schedule: T[] | undefined,
  currentWeek: number,
  date: Date,
  startDate: Date | string | number | undefined,
): RunningDayState<T> {
  if (scheduleDays.length > 0) {
    const weekEntries = (schedule ?? []).filter((e) => e.week === currentWeek);

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
