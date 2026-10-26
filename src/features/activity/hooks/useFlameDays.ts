'use client';

/**
 * useFlameDays (enable_flame_tiers_v1) — a stable `(isoDate) => FlameDay` getter over the
 * device's activity store, weekly-volume session logs and the lead program's daily target
 * (useDailyStrengthTarget). `pending` adds this session's numbers to TODAY while its own
 * write hasn't landed yet (the strength summary, before Finish). Disabled ⇒ null and no reads.
 */
import { useCallback } from 'react';
import { useActivityStore } from '../store/useActivityStore';
import { useDateKey } from './useMidnightRefresh';
import { useUserStore } from '@/features/user';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useDailyStrengthTarget } from '@/features/home/hooks/useDailyStrengthTarget';
import { isTodayTrainingDay } from '@/features/home/utils/dailyStrengthTarget';
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';
import { flameDayFromContext, type PendingSession } from '../lib/flame-day-input';
import type { FlameDay } from '../lib/flame-level';

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function useFlameDays(enabled: boolean, pending?: PendingSession | null): ((isoDate: string) => FlameDay) | null {
  const today = useActivityStore((s) => s.today);
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);
  const scheduleDaysArr = useUserStore((s) => s.profile?.lifestyle?.scheduleDays);
  const template = useUserStore((s) => s.profile?.lifestyle?.recurringTemplate) as
    | Record<string, string[] | undefined>
    | undefined;
  const target = useDailyStrengthTarget(enabled);
  const dateKey = useDateKey();
  const pStrengthMin = pending?.strengthMinutes ?? 0;
  const pCardioMin = pending?.cardioMinutes ?? 0;
  const pSets = pending?.strengthSets ?? 0;

  const getter = useCallback(
    (isoDate: string): FlameDay => {
      const isToday = isoDate === dateKey;
      const p = isToday && (pStrengthMin || pCardioMin || pSets)
        ? { strengthMinutes: pStrengthMin, cardioMinutes: pCardioMin, strengthSets: pSets }
        : null;
      return flameDayFromContext({
        activity: isToday ? (today ?? weekActivities?.[isoDate]) : weekActivities?.[isoDate],
        loggedSets: summarizeTodayStrengthVolume(sessionLogs, isoDate).setsCompleted,
        weeklyTarget: target.weeklyTarget,
        scheduleDays: target.scheduleDays,
        isTrainingDay: isTodayTrainingDay(scheduleDaysArr, template, localDate(isoDate)),
        pending: p,
      });
    },
    [dateKey, today, weekActivities, sessionLogs, target.weeklyTarget, target.scheduleDays, scheduleDaysArr, template, pStrengthMin, pCardioMin, pSets],
  );
  return enabled ? getter : null;
}
