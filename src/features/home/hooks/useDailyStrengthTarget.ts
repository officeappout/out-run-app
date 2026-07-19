'use client';

/**
 * useDailyStrengthTarget — resolves a STABLE daily strength target for the ring.
 *
 * Target = weekly per-level volume ÷ schedule days. The weekly value comes live
 * from `resolveActiveProgramBudget` (so a mid-week level-up raises the target
 * immediately, avoiding the stored `weeklyBudget` Sunday-lag). Before the async
 * resolve returns, a synchronous fallback (`calculateWeeklyBudget(level)`) is
 * used so the ring never flickers to empty.
 *
 * All derivation lives in `dailyStrengthTarget.ts` (pure, unit-tested).
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user';
import { resolveActiveProgramBudget } from '@/features/workout-engine/services/lead-program.service';
import { calculateWeeklyBudget } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import {
  computeBaseLevel,
  computeDailyStrengthTarget,
  isTodayTrainingDay,
  type DailyStrengthTarget,
  type DailyStrengthTargetSource,
} from '../utils/dailyStrengthTarget';

export function useDailyStrengthTarget(): DailyStrengthTarget {
  const profile = useUserStore((s) => s.profile);

  const scheduleDaysArr = profile?.lifestyle?.scheduleDays;
  const recurringTemplate = profile?.lifestyle?.recurringTemplate as
    | Record<string, string[] | undefined>
    | undefined;
  const tracks = profile?.progression?.tracks;
  const domains = profile?.progression?.domains;

  const baseLevel = useMemo(
    () => computeBaseLevel(tracks, domains),
    [tracks, domains],
  );
  const scheduleDays = scheduleDaysArr?.length ?? 0;
  const isRestDay = useMemo(
    () => !isTodayTrainingDay(scheduleDaysArr, recurringTemplate),
    [scheduleDaysArr, recurringTemplate],
  );

  // Async-resolved weekly target (program-level). Null until first resolve.
  const [resolved, setResolved] = useState<{
    weeklyTarget: number;
    source: Exclude<DailyStrengthTargetSource, 'loading'>;
  } | null>(null);

  useEffect(() => {
    if (!profile) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    resolveActiveProgramBudget(profile)
      .then((lead) => {
        if (cancelled) return;
        setResolved(
          lead?.weeklyVolumeTarget != null
            ? { weeklyTarget: lead.weeklyVolumeTarget, source: 'lead' }
            : { weeklyTarget: calculateWeeklyBudget(baseLevel), source: 'fallback' },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ weeklyTarget: calculateWeeklyBudget(baseLevel), source: 'fallback' });
        }
      });
    return () => {
      cancelled = true;
    };
    // Re-resolve on user switch or level-up (baseLevel changes on level-up).
  }, [profile?.id, baseLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronous fallback keeps the ring stable before/without the async resolve.
  const weeklyTarget = resolved?.weeklyTarget ?? calculateWeeklyBudget(baseLevel);
  const source: DailyStrengthTargetSource = resolved?.source ?? 'loading';

  return computeDailyStrengthTarget({ weeklyTarget, scheduleDays, isRestDay, source });
}
