/**
 * Running program alignment — the PURE half of workout-completion.service.ts.
 *
 * Schedule advisor phase A (bugs #7 / #12): handleProgramAlignment read the clock
 * internally (`new Date()` in daysSince + calculateCurrentWeek), and rollBackOneWeek's
 * schedule rewrite lived inline next to its Firestore write and silently dropped the
 * per-entry fields the rules engine reads (category / slotType / isQualityWorkout /
 * priority). Both now live here: no Firebase import, no clock — `asOf` is always passed
 * in — so the advisor (client AND server) and the tests can call them.
 *
 * workout-completion.service.ts keeps its exported names and signatures, delegating here
 * with `new Date()`, so its existing callers see no change (except the rollback fix).
 */
import type { ActiveRunningProgram } from '../types/running.types';
import { calculateCurrentWeek } from '@/lib/running-current-week';

export type AlignmentAction =
  | { type: 'none' }
  | { type: 'quality_makeup'; missedCount: number }
  | { type: 'plan_realign'; daysSinceLastWorkout: number }
  | { type: 'rebuild'; daysSinceLastWorkout: number };

type ScheduleEntry = ActiveRunningProgram['schedule'][number];

/** Whole local days between `date` and `asOf` (both floored to local midnight). */
export function daysBetweenLocal(date: Date | string | number, asOf: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const now = new Date(asOf);
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * The Missed Workout Brain, pure (bug #12). Same layers as before:
 *   1 missed           → none
 *   2-3 missed         → quality_makeup
 *   7-21 day gap       → plan_realign
 *   21+ day gap        → rebuild
 */
export function resolveProgramAlignment(
  activeProgram: Pick<ActiveRunningProgram, 'startDate' | 'schedule'>,
  lastWorkoutDate: string | Date | null | undefined,
  asOf: Date,
): AlignmentAction {
  if (!lastWorkoutDate) return { type: 'none' };

  const gapDays = daysBetweenLocal(lastWorkoutDate, asOf);
  if (gapDays >= 21) return { type: 'rebuild', daysSinceLastWorkout: gapDays };
  if (gapDays >= 7) return { type: 'plan_realign', daysSinceLastWorkout: gapDays };

  const calendarWeek = calculateCurrentWeek(activeProgram.startDate, asOf);
  const missedThisWeek = activeProgram.schedule.filter((e) => e.week === calendarWeek && e.status === 'skipped').length;
  const missedPrevWeek = activeProgram.schedule.filter((e) => e.week === calendarWeek - 1 && e.status === 'skipped').length;
  const totalRecentMissed = missedThisWeek + missedPrevWeek;

  if (totalRecentMissed >= 2) return { type: 'quality_makeup', missedCount: totalRecentMissed };
  return { type: 'none' };
}

/**
 * "Back 1 week", pure (bug #7): the current calendar week's entries are replaced by
 * copies of the previous week's, reset to pending. Every per-entry field the rules
 * engine / home cards read is PRESERVED (category, workoutName, slotType,
 * isQualityWorkout, priority) — the old inline version kept only workoutId, so a rolled-
 * back week lost its quality / long-run identity and the weaver read it as all-unknown.
 * Run-time results (actualPerformance) are not copied: the repeated week is not done yet.
 *
 * Returns null when there is nothing to roll back to (week 1, or no previous entries).
 */
export function buildRolledBackSchedule(
  schedule: ActiveRunningProgram['schedule'],
  calendarWeek: number,
  /** false = the legacy copy (workoutId only). The live writer passes RUNNING_ROLLBACK_PRESERVE_FIELDS_V1. */
  preserveFields = true,
): ActiveRunningProgram['schedule'] | null {
  const prevWeek = calendarWeek - 1;
  if (prevWeek < 1) return null;
  const prevWeekEntries = schedule.filter((e) => e.week === prevWeek);
  if (prevWeekEntries.length === 0) return null;

  const kept = schedule.filter((e) => e.week !== calendarWeek);
  const newEntries: ScheduleEntry[] = prevWeekEntries.map((e, i) => {
    const copy: ScheduleEntry = {
      week: calendarWeek,
      day: i + 1,
      workoutId: e.workoutId,
      status: 'pending',
    };
    if (!preserveFields) return copy;
    if (e.category !== undefined) copy.category = e.category;
    if (e.workoutName !== undefined) copy.workoutName = e.workoutName;
    if (e.isQualityWorkout !== undefined) copy.isQualityWorkout = e.isQualityWorkout;
    if (e.priority !== undefined) copy.priority = e.priority;
    if (e.slotType !== undefined) copy.slotType = e.slotType;
    return copy;
  });
  return [...kept, ...newEntries];
}
