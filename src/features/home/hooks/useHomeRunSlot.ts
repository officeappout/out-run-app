'use client';

/**
 * Home v2 (enable_home_v2): today's / the next planned run for the daily
 * carousel, from the profile already in the store — no reads, no listeners.
 * `hasRunningPlan` also drives the running-only week strip.
 * "דלג להיום" is the same local, unsaved skip RunWeekListV2 has (cleared on a
 * new day / reload) — it only changes which run the card shows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveRunningDayState, type RunningDayState } from '@/lib/running-day-resolution';
import { runPlacementOf } from '@/features/schedule/utils/runWeekByType';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveHomeRunSlot, type HomeRunEntry, type HomeRunSlot } from '@/features/home/utils/home-run-slot';
import { usePlannedRunWorkout } from '@/features/home/hooks/usePlannedRunWorkout';
import { plannedRunDoneToday, plannedTargetOfBlocks, type PlannedRunDoneResult, type RunCoverageDoc } from '@/lib/run-coverage';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/** Run-done state input (enable_home_v2): today's saved docs. Absent / disabled = the old behaviour. */
export interface HomeRunDoneInput {
  enabled: boolean;
  /**
   * enable_run_done_state_v1: also mark a 'done' / 'covered' entry completed in the user's plan
   * (best-effort, transactional, once per entry per session). Covers a free run that covered the
   * slot and heals a planned run whose player-side write did not land.
   */
  writeback?: boolean;
  workouts: ReadonlyArray<RunCoverageDoc> | null | undefined;
}

export interface HomeRunSlotState {
  slot: HomeRunSlot | null;
  /** What today's saved runs did to today's entry ('none' when the done state is off). */
  done: PlannedRunDoneResult;
  hasRunningPlan: boolean;
  currentWeek: number | undefined;
  skipToday: () => void;
  undoSkip: () => void;
}

export function useHomeRunSlot(
  profile: UserFullProfile | null | undefined,
  enabled: boolean,
  hasStrengthProgram: boolean,
  /** enable_home_v2: runs sit on their weekday by slot type (the signup placement). */
  byType = false,
  runDone?: HomeRunDoneInput,
): HomeRunSlotState {
  const running = profile?.running;
  const schedule = running?.activeProgram?.schedule as HomeRunEntry[] | undefined;
  const startDate = running?.activeProgram?.startDate;
  const storedWeek = running?.activeProgram?.currentWeek;
  const scheduleDays = running?.scheduleDays as string[] | undefined;

  const { level: placeLevel, targetDistance: placeDistance, preferredLongRunDay: placeLongDay, runMoves } = runPlacementOf(running);

  // Recompute when the day rolls over while home stays open.
  const todayKey = new Date().toDateString();
  // The day the skip was tapped on — a new day clears it.
  const [skippedOn, setSkippedOn] = useState<string | null>(null);
  const skippedToday = skippedOn === todayKey;
  const skipToday = useCallback(() => setSkippedOn(new Date().toDateString()), []);
  const undoSkip = useCallback(() => setSkippedOn(null), []);

  const hasRunningPlan = !!running?.isUnlocked && !!schedule?.length;
  const currentWeek = useMemo(
    () => resolveRunningCurrentWeek(startDate as any, storedWeek) ?? undefined,
    [startDate, storedWeek],
  );
  const dayState = useMemo<RunningDayState<HomeRunEntry> | null>(() => {
    if (!enabled || !hasRunningPlan) return null;
    return resolveRunningDayState<HomeRunEntry>(
      scheduleDays ?? [],
      schedule,
      currentWeek ?? 1,
      new Date(),
      startDate as any,
      byType ? { byType: true, level: placeLevel, targetDistance: placeDistance, preferredLongRunDay: placeLongDay, runMoves } : undefined,
    );
  }, [enabled, hasRunningPlan, byType, placeLevel, placeDistance, placeLongDay, runMoves, schedule, startDate, currentWeek, scheduleDays, todayKey]);

  // Run-done state (enable_home_v2): is today's run already done / covered / too short to count?
  // Judged from today's saved docs (no new reads). A planned doc carries its own target; only a
  // run without one (a free run) needs the plan's target — loaded quietly, once, and only then.
  const doneOn = !!runDone?.enabled;
  const pendingToday = doneOn && dayState?.isRunDay && dayState.todayEntry && (dayState.todayEntry.status === 'pending' || !dayState.todayEntry.status)
    ? dayState.todayEntry
    : null;
  const entryMatches = (d: RunCoverageDoc) => !!pendingToday && d.runMeta?.plan?.week === pendingToday.week && d.runMeta?.plan?.day === pendingToday.day;
  const needsEntryTarget = !!pendingToday && !!runDone?.workouts?.some(
    (d) => (d.workoutType || d.activityType) === 'running' && !(entryMatches(d) && d.runMeta?.target),
  );
  const { workout: targetWorkout } = usePlannedRunWorkout({
    enabled: needsEntryTarget,
    profile,
    workoutId: pendingToday?.workoutId,
    week: pendingToday?.week,
    currentWeek,
    calmLoad: null,
    quiet: true,
  });
  const entryTarget = useMemo(() => plannedTargetOfBlocks(targetWorkout?.blocks), [targetWorkout]);
  const done = useMemo<PlannedRunDoneResult>(
    () => (pendingToday ? plannedRunDoneToday(pendingToday, runDone?.workouts, entryTarget) : { state: 'none' }),
    [pendingToday, runDone?.workouts, entryTarget],
  );

  const wroteRef = useRef<string | null>(null);
  const uid = profile?.id;
  const writeback = !!runDone?.writeback;
  useEffect(() => {
    if (!writeback || !uid || !pendingToday) return;
    if (done.state !== 'done' && done.state !== 'covered') return;
    const key = `${uid}:${pendingToday.week}:${pendingToday.day}`;
    if (wroteRef.current === key) return;
    wroteRef.current = key;
    import('@/features/workout-engine/core/services/planned-run-complete')
      .then(({ completePlannedRunEntry }) => completePlannedRunEntry(uid, {
        week: pendingToday.week,
        day: pendingToday.day,
        workoutId: done.workoutId ?? null,
        coverage: done.coverage ?? 'free',
      }))
      .catch((e) => console.warn('[useHomeRunSlot] run-done write skipped:', e));
  }, [writeback, uid, pendingToday, done]);

  const resolved = useMemo<Omit<HomeRunSlotState, 'skipToday' | 'undoSkip'>>(() => {
    if (!dayState) return { slot: null, done, hasRunningPlan, currentWeek };
    return {
      slot: resolveHomeRunSlot({
        enabled, hasRunningPlan, hasStrengthProgram, dayState, skippedToday,
        ...(doneOn ? { doneState: done.state } : {}),
      }),
      done,
      hasRunningPlan,
      currentWeek,
    };
  }, [dayState, done, doneOn, enabled, hasRunningPlan, hasStrengthProgram, skippedToday, currentWeek]);

  return { ...resolved, skipToday, undoSkip };
}
