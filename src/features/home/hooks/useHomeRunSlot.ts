'use client';

/**
 * Home v2 (enable_home_v2): today's / the next planned run for the daily
 * carousel, from the profile already in the store — no reads, no listeners.
 * `hasRunningPlan` also drives the running-only week strip.
 * "דלג להיום" is the same local, unsaved skip RunWeekListV2 has (cleared on a
 * new day / reload) — it only changes which run the card shows.
 */

import { useCallback, useMemo, useState } from 'react';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import { runPlacementOf } from '@/features/schedule/utils/runWeekByType';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveHomeRunSlot, type HomeRunEntry, type HomeRunSlot } from '@/features/home/utils/home-run-slot';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

export interface HomeRunSlotState {
  slot: HomeRunSlot | null;
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
): HomeRunSlotState {
  const running = profile?.running;
  const schedule = running?.activeProgram?.schedule as HomeRunEntry[] | undefined;
  const startDate = running?.activeProgram?.startDate;
  const storedWeek = running?.activeProgram?.currentWeek;
  const scheduleDays = running?.scheduleDays as string[] | undefined;

  const { level: placeLevel, targetDistance: placeDistance } = runPlacementOf(running);

  // Recompute when the day rolls over while home stays open.
  const todayKey = new Date().toDateString();
  // The day the skip was tapped on — a new day clears it.
  const [skippedOn, setSkippedOn] = useState<string | null>(null);
  const skippedToday = skippedOn === todayKey;
  const skipToday = useCallback(() => setSkippedOn(new Date().toDateString()), []);
  const undoSkip = useCallback(() => setSkippedOn(null), []);

  const resolved = useMemo<Omit<HomeRunSlotState, 'skipToday' | 'undoSkip'>>(() => {
    const hasRunningPlan = !!running?.isUnlocked && !!schedule?.length;
    const currentWeek = resolveRunningCurrentWeek(startDate as any, storedWeek) ?? undefined;
    if (!enabled || !hasRunningPlan) return { slot: null, hasRunningPlan, currentWeek };
    const dayState = resolveRunningDayState<HomeRunEntry>(
      scheduleDays ?? [],
      schedule,
      currentWeek ?? 1,
      new Date(),
      startDate as any,
      byType ? { byType: true, level: placeLevel, targetDistance: placeDistance } : undefined,
    );
    return {
      slot: resolveHomeRunSlot({ enabled, hasRunningPlan, hasStrengthProgram, dayState, skippedToday }),
      hasRunningPlan,
      currentWeek,
    };
  }, [enabled, byType, placeLevel, placeDistance, hasStrengthProgram, running?.isUnlocked, schedule, startDate, storedWeek, scheduleDays, todayKey, skippedToday]);

  return { ...resolved, skipToday, undoSkip };
}
