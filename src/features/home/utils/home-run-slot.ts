/**
 * Home v2 (enable_home_v2) — which planned run, if any, gets a card in the
 * daily carousel ("האימון היומי שלך"), and where it goes among the strength
 * suggestions. Pure: the caller passes the already-resolved day state
 * (resolveRunningDayState on the profile's activeProgram — no extra reads).
 *
 * Why: the run card used to live only inside StatsOverview's RUNNING branch,
 * which the daily carousel hides almost every day (audit-run-schedule §5) —
 * a running-only user never saw today's run before finishing a workout, and
 * a dual-track user in HYBRID mode never saw it at all.
 *
 * Rules:
 *  - Run day with a pending entry → that run, as "today".
 *  - Otherwise (rest day / today's run skipped or done) → the next pending
 *    run, as "next" ("הבא").
 *  - Running-only user (no strength program) → the run is their workout: first.
 *  - Dual-track, run today → the weaver's double-day rule (R2/R3,
 *    resolveDoubleDayOrder): a quality run goes before strength ("קודם
 *    הריצה"), an easy/long run goes after the day's first strength card.
 *  - Dual-track, next run → last, after today's strength.
 */

import { isQualityDay, type RunningDayRole } from '@/features/schedule/engine/runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { RunningDayState, RunningScheduleEntry } from '@/lib/running-day-resolution';

export interface HomeRunEntry extends RunningScheduleEntry {
  isQualityWorkout?: boolean;
  slotType?: RunningDayRole;
}

export type HomeRunSlotPosition = 'first' | 'afterFirst' | 'last';

export interface HomeRunSlot<E extends HomeRunEntry = HomeRunEntry> {
  kind: 'today' | 'next';
  entry: E;
  /** "next" only, when the weekday is known (scheduleDays drives the day). */
  daysAway?: number;
  position: HomeRunSlotPosition;
}

export interface ResolveHomeRunSlotInput<E extends HomeRunEntry> {
  /** enable_home_v2. Off → null, always. */
  enabled: boolean;
  /** The user has a built running plan (activeProgram.schedule has entries). */
  hasRunningPlan: boolean;
  hasStrengthProgram: boolean;
  dayState: Pick<RunningDayState<E>, 'isRunDay' | 'todayEntry' | 'nextEntry' | 'nextEntryDaysAway'>;
}

const isPending = (e: RunningScheduleEntry | undefined): e is RunningScheduleEntry =>
  !!e && (e.status === 'pending' || !e.status);

/** Quality by the schedule engine's own rule (slotType > isQualityWorkout > category). */
export function isQualityRunEntry(entry: HomeRunEntry): boolean {
  return isQualityDay({
    dayOfWeek: 0,
    category: (entry.category ?? 'easy_run') as WorkoutCategory,
    isQualityWorkout: entry.isQualityWorkout,
    slotType: entry.slotType,
  });
}

export function resolveHomeRunSlot<E extends HomeRunEntry>(
  input: ResolveHomeRunSlotInput<E>,
): HomeRunSlot<E> | null {
  const { enabled, hasRunningPlan, hasStrengthProgram, dayState } = input;
  if (!enabled || !hasRunningPlan) return null;

  if (dayState.isRunDay && isPending(dayState.todayEntry)) {
    const entry = dayState.todayEntry as E;
    const position: HomeRunSlotPosition = !hasStrengthProgram
      ? 'first'
      : isQualityRunEntry(entry) ? 'first' : 'afterFirst';
    return { kind: 'today', entry, position };
  }

  if (isPending(dayState.nextEntry)) {
    return {
      kind: 'next',
      entry: dayState.nextEntry as E,
      daysAway: dayState.nextEntryDaysAway,
      position: hasStrengthProgram ? 'last' : 'first',
    };
  }
  return null;
}

/** Inserts the run card into the carousel's items at the slot's position. */
export function placeRunCard<T>(items: readonly T[], runItem: T, position: HomeRunSlotPosition): T[] {
  if (position === 'first' || items.length === 0) return [runItem, ...items];
  if (position === 'afterFirst') return [items[0], runItem, ...items.slice(1)];
  return [...items, runItem];
}

/** "מחר" / "בעוד 3 ימים" / "הבא" — the "next" card's day hint. */
export function nextRunDayHint(daysAway: number | undefined): string {
  if (daysAway === 1) return 'מחר';
  if (daysAway != null && daysAway > 1) return `בעוד ${daysAway} ימים`;
  return 'הבא';
}
