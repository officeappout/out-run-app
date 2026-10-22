'use client';

/**
 * Loads one dated week for the planner week builder: the week's userSchedule docs (one
 * batched read) and its finished workouts (one range query, past days only), then builds it
 * with buildPlannerWeek. Read-only. `sunday` null = idle (nothing is read).
 */
import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import { getWorkoutsInDateRange } from '@/features/workout-engine/core/services/storage.service';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { addDaysToKey } from '../../advisor';
import { localDateKey } from '../../advisor/adapters/client';
import type { AdvisorProfile } from '../../advisor/types';
import { toAdvisorWorkouts } from '../../advisor/workouts';
import { buildPlannerWeek, type PlannerWeekModel } from './plannerWeek';

export type PlannerWeekState =
  | { status: 'idle' | 'loading' | 'error'; model: null; keys: string[]; todayKey: string }
  | { status: 'ready'; model: PlannerWeekModel; keys: string[]; todayKey: string };

export function usePlannerWeek(userId: string | null | undefined, sunday: string | null, refreshKey = 0): PlannerWeekState {
  const profile = useUserStore((s) => s.profile);
  const runsByType = useHomeV2();
  const todayKey = localDateKey(new Date());
  const keys = sunday ? Array.from({ length: 7 }, (_, i) => addDaysToKey(sunday, i)) : [];
  const [state, setState] = useState<PlannerWeekState>({ status: 'idle', model: null, keys, todayKey });

  useEffect(() => {
    if (!userId || !sunday || !profile) {
      setState({ status: 'idle', model: null, keys, todayKey });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', model: null, keys, todayKey });
    const lastPast = keys[6] < todayKey ? keys[6] : todayKey;
    Promise.all([
      getScheduleEntriesForDates(userId, keys),
      keys[0] <= todayKey ? getWorkoutsInDateRange(userId, keys[0], lastPast) : Promise.resolve([]),
    ])
      .then(([entries, workouts]) => {
        if (cancelled) return;
        if (!entries) {
          setState({ status: 'error', model: null, keys, todayKey });
          return;
        }
        const model = buildPlannerWeek({
          keys,
          todayKey,
          profile: profile as unknown as AdvisorProfile,
          entriesByDate: entries,
          workouts: toAdvisorWorkouts(
            workouts.map((w) => ({ dateKey: localDateKey(w.date), workoutType: w.workoutType, activityType: w.activityType, category: w.category, durationSec: w.duration })),
          ),
          resolveSlug: resolveToSlug,
          runsByType,
        });
        setState({ status: 'ready', model, keys, todayKey });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', model: null, keys, todayKey });
      });
    return () => {
      cancelled = true;
    };
    // keys / todayKey derive from sunday + the day; profile identity changes on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sunday, profile, refreshKey, runsByType, todayKey]);

  return state;
}
