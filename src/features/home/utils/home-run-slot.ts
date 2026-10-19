/**
 * Which planned run, if any, gets a card in the daily carousel ("האימון
 * היומי שלך"), and where it goes among the strength suggestions. Both flag
 * states (19.10.2026): enable_home_v2 renders HomeRunCarouselCard, flag off
 * renders the legacy NextRunWorkoutCard in the same slot. Pure: the caller passes the already-resolved day state
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
 *  - "דלג להיום" (skippedToday, the same local, unsaved skip as RunWeekListV2):
 *    today's run steps aside — the next run shows instead (or, when the week
 *    has none left, today's run as "skipped" so the skip can be undone);
 *    it moves out of the lead position.
 *
 * resolveRunSlotSurface then decides WHERE it renders: inside the carousel,
 * on its own (carousel hidden because today's workout is done, or empty),
 * or not at all (StatsOverview RUNNING already shows NextRunWorkoutCard).
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
  /** The user tapped "דלג להיום" on today's run (local, unsaved). */
  skippedToday?: boolean;
}

export interface ResolveHomeRunSlotInput<E extends HomeRunEntry> {
  /** Off → null, always. Home passes true for every runner since 19.10.2026 (the flag picks the card, not the slot). */
  enabled: boolean;
  /** The user has a built running plan (activeProgram.schedule has entries). */
  hasRunningPlan: boolean;
  hasStrengthProgram: boolean;
  dayState: Pick<RunningDayState<E>, 'isRunDay' | 'todayEntry' | 'nextEntry' | 'nextEntryDaysAway'>;
  /** "דלג להיום" was tapped on today's run. */
  skippedToday?: boolean;
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
  const { enabled, hasRunningPlan, hasStrengthProgram, dayState, skippedToday = false } = input;
  if (!enabled || !hasRunningPlan) return null;

  const hasTodayRun = dayState.isRunDay && isPending(dayState.todayEntry);
  if (hasTodayRun && skippedToday) {
    const position: HomeRunSlotPosition = hasStrengthProgram ? 'last' : 'first';
    if (isPending(dayState.nextEntry)) {
      return { kind: 'next', entry: dayState.nextEntry as E, daysAway: dayState.nextEntryDaysAway, position, skippedToday: true };
    }
    return { kind: 'today', entry: dayState.todayEntry as E, position, skippedToday: true };
  }

  if (hasTodayRun) {
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

/** What the anchor slot shows today. */
export type HomeAnchorState =
  | 'carousel' // "האימון היומי שלך" has suggestions
  | 'loading'  // suggestions still in flight (skeleton)
  | 'done'     // today's workout is done → carousel hidden
  | 'empty'    // resolved with nothing → StatsOverview fallback
  | 'other';   // a past / future day is selected

export type RunSlotSurface = 'carousel' | 'standalone' | null;

/**
 * Where the run slot renders. RUNNING mode's StatsOverview fallback already
 * mounts NextRunWorkoutCard (ignores hideWorkoutSection), so the standalone
 * card is only for the other modes — never two run cards.
 *
 * Flag off (`v2` false — the ungated fix, 19.10.2026): the slot is resolved for
 * every runner, but it only becomes a carousel slide (the legacy
 * NextRunWorkoutCard). Whenever the carousel isn't showing, StatsOverview's
 * fallback is exactly today's behaviour — no standalone card.
 */
export function resolveRunSlotSurface(
  slot: HomeRunSlot | null,
  anchor: HomeAnchorState,
  dashboardMode: string,
  v2 = true,
): RunSlotSurface {
  if (!slot) return null;
  if (anchor === 'carousel') return 'carousel';
  if (!v2) return null;
  if (anchor === 'loading' || anchor === 'other') return null;
  if (dashboardMode === 'RUNNING') return null;
  // Workout done (e.g. strength) → only a still-pending run of TODAY stays.
  if (anchor === 'done') return slot.kind === 'today' && !slot.skippedToday ? 'standalone' : null;
  return 'standalone';
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
