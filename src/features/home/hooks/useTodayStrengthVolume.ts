'use client';

/**
 * useTodayStrengthVolume — thin React wrapper over
 * `summarizeTodayStrengthVolume`. Subscribes to the weekly volume store's
 * session logs and returns today's completed strength volume.
 *
 * Shared by the Daily Strength Ring (Layer A) and the Phase-1 partial/full
 * signal. All logic lives in the pure util so it stays unit-testable.
 */

import { useMemo } from 'react';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import {
  summarizeTodayStrengthVolume,
  type TodayStrengthVolume,
} from '../utils/todayStrengthVolume';

/**
 * @param dateISO Optional target day (local `YYYY-MM-DD`). Defaults to today.
 */
export function useTodayStrengthVolume(dateISO?: string): TodayStrengthVolume {
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);
  return useMemo(
    () => summarizeTodayStrengthVolume(sessionLogs, dateISO),
    [sessionLogs, dateISO],
  );
}
