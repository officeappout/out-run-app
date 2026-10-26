'use client';

/**
 * useFlameDays (enable_flame_tiers_v1) — a stable `(isoDate, extra?) => FlameDay` getter.
 * Sources (flame-day-input.ts): the server-saved dailyProgress of each day (`saved` for past
 * days — the caller's usePastWorkoutCompleted goalsMap, no extra reads; today's doc live here),
 * the activity store's day, today's local session logs, the lead program's daily target, and
 * `pending` (this session before its own write lands). Disabled ⇒ null and no reads.
 */
import { useCallback } from 'react';
import { useActivityStore } from '../store/useActivityStore';
import { useDateKey } from './useMidnightRefresh';
import { useUserStore } from '@/features/user';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useDailyStrengthTarget } from '@/features/home/hooks/useDailyStrengthTarget';
import { useDailyProgress } from '@/features/home/hooks/useDailyProgress';
import { isTodayTrainingDay } from '@/features/home/utils/dailyStrengthTarget';
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';
import { flameDayFromContext, type PendingSession, type SavedDayGoals } from '../lib/flame-day-input';
import { savedDayGoalsOf } from '../lib/saved-day-goals';
import type { FlameDay } from '../lib/flame-level';

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export interface FlameDayExtra {
  /** The plan's run / walk for that day is done (weekly strip: run entry / walk cell). */
  aerobicPlanDone?: boolean;
}

export type FlameDayGetter = (isoDate: string, extra?: FlameDayExtra) => FlameDay;

export function useFlameDays(
  enabled: boolean,
  pending?: PendingSession | null,
  savedPast?: ReadonlyMap<string, SavedDayGoals> | null,
): FlameDayGetter | null {
  const today = useActivityStore((s) => s.today);
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);
  const scheduleDaysArr = useUserStore((s) => s.profile?.lifestyle?.scheduleDays);
  const template = useUserStore((s) => s.profile?.lifestyle?.recurringTemplate) as
    | Record<string, string[] | undefined>
    | undefined;
  const target = useDailyStrengthTarget(enabled);
  const todayProgress = useDailyProgress(undefined, enabled);
  const dateKey = useDateKey();
  const pStrengthMin = pending?.strengthMinutes ?? 0;
  const pCardioMin = pending?.cardioMinutes ?? 0;
  const pSets = pending?.strengthSets ?? 0;

  const getter = useCallback<FlameDayGetter>(
    (isoDate, extra) => {
      const isToday = isoDate === dateKey;
      return flameDayFromContext({
        activity: isToday ? (today ?? weekActivities?.[isoDate]) : weekActivities?.[isoDate],
        isToday,
        loggedSets: isToday ? summarizeTodayStrengthVolume(sessionLogs, isoDate).setsCompleted : 0,
        weeklyTarget: target.weeklyTarget,
        scheduleDays: target.scheduleDays,
        isTrainingDay: isTodayTrainingDay(scheduleDaysArr, template, localDate(isoDate)),
        saved: isToday
          ? savedDayGoalsOf(todayProgress as unknown as Record<string, unknown> | null)
          : savedPast?.get(isoDate) ?? null,
        aerobicPlanDone: extra?.aerobicPlanDone,
        pending: isToday && (pStrengthMin || pCardioMin || pSets)
          ? { strengthMinutes: pStrengthMin, cardioMinutes: pCardioMin, strengthSets: pSets }
          : null,
      });
    },
    [dateKey, today, weekActivities, sessionLogs, target.weeklyTarget, target.scheduleDays, scheduleDaysArr, template, todayProgress, savedPast, pStrengthMin, pCardioMin, pSets],
  );
  return enabled ? getter : null;
}
