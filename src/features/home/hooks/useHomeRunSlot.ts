'use client';

/**
 * Home v2 (enable_home_v2): today's / the next planned run for the daily
 * carousel, from the profile already in the store — no reads, no listeners.
 * `hasRunningPlan` also drives the running-only week strip.
 */

import { useMemo } from 'react';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveHomeRunSlot, type HomeRunEntry, type HomeRunSlot } from '@/features/home/utils/home-run-slot';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

export interface HomeRunSlotState {
  slot: HomeRunSlot | null;
  hasRunningPlan: boolean;
  currentWeek: number | undefined;
}

export function useHomeRunSlot(
  profile: UserFullProfile | null | undefined,
  enabled: boolean,
  hasStrengthProgram: boolean,
): HomeRunSlotState {
  const running = profile?.running;
  const schedule = running?.activeProgram?.schedule as HomeRunEntry[] | undefined;
  const startDate = running?.activeProgram?.startDate;
  const storedWeek = running?.activeProgram?.currentWeek;
  const scheduleDays = running?.scheduleDays as string[] | undefined;

  // Recompute when the day rolls over while home stays open.
  const todayKey = new Date().toDateString();

  return useMemo<HomeRunSlotState>(() => {
    const hasRunningPlan = !!running?.isUnlocked && !!schedule?.length;
    const currentWeek = resolveRunningCurrentWeek(startDate as any, storedWeek) ?? undefined;
    if (!enabled || !hasRunningPlan) return { slot: null, hasRunningPlan, currentWeek };
    const dayState = resolveRunningDayState<HomeRunEntry>(
      scheduleDays ?? [],
      schedule,
      currentWeek ?? 1,
      new Date(),
      startDate as any,
    );
    return {
      slot: resolveHomeRunSlot({ enabled, hasRunningPlan, hasStrengthProgram, dayState }),
      hasRunningPlan,
      currentWeek,
    };
  }, [enabled, hasStrengthProgram, running?.isUnlocked, schedule, startDate, storedWeek, scheduleDays, todayKey]);
}
